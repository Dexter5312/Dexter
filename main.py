from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Dict
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import json

from database import engine, Base, get_db
import models, schemas, auth

from fastapi.middleware.cors import CORSMiddleware

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with your Firebase URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for the frontend
app.mount("/js", StaticFiles(directory="js"), name="js")
app.mount("/css", StaticFiles(directory="css"), name="css")
import os
if os.path.exists("logo.png"):
    @app.get("/logo.png")
    def get_logo():
        return FileResponse("logo.png")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- Dependency ---
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = auth.decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    username: str = payload.get("sub")
    if username is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user

# --- Routes ---

@app.get("/")
def read_root():
    return FileResponse("index.html")

@app.post("/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = auth.get_password_hash(user.password)
    new_user = models.User(username=user.username, password_hash=hashed_password, public_key=user.public_key)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/token", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    access_token = auth.create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user

@app.get("/users/{username}", response_model=schemas.UserResponse)
def get_user(username: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.post("/friend-requests", response_model=schemas.FriendRequestResponse)
def send_friend_request(req: schemas.FriendRequestCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    receiver = db.query(models.User).filter(models.User.username == req.receiver_username).first()
    if not receiver:
        raise HTTPException(status_code=404, detail="Receiver not found")
    if receiver.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot send request to yourself")
    
    # Check if already sent
    existing_req = db.query(models.FriendRequest).filter(
        models.FriendRequest.sender_id == current_user.id,
        models.FriendRequest.receiver_id == receiver.id
    ).first()
    if existing_req:
        raise HTTPException(status_code=400, detail="Request already sent")
        
    new_req = models.FriendRequest(sender_id=current_user.id, receiver_id=receiver.id)
    db.add(new_req)
    db.commit()
    db.refresh(new_req)
    return new_req

@app.get("/friend-requests", response_model=List[schemas.FriendRequestResponse])
def get_friend_requests(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.FriendRequest).filter(
        or_(models.FriendRequest.sender_id == current_user.id, models.FriendRequest.receiver_id == current_user.id)
    ).all()

@app.post("/friend-requests/{req_id}/accept", response_model=schemas.FriendRequestResponse)
def accept_friend_request(req_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    req = db.query(models.FriendRequest).filter(models.FriendRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.receiver_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to accept this request")
    
    req.status = "accepted"
    db.commit()
    db.refresh(req)
    return req

@app.get("/messages/{user_id}", response_model=List[schemas.MessageResponse])
def get_messages(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Verify they are friends
    req = db.query(models.FriendRequest).filter(
        or_(
            (models.FriendRequest.sender_id == current_user.id) & (models.FriendRequest.receiver_id == user_id),
            (models.FriendRequest.sender_id == user_id) & (models.FriendRequest.receiver_id == current_user.id)
        ),
        models.FriendRequest.status == "accepted"
    ).first()
    if not req:
        raise HTTPException(status_code=403, detail="Not friends")
        
    messages = db.query(models.Message).filter(
        or_(
            (models.Message.sender_id == current_user.id) & (models.Message.receiver_id == user_id),
            (models.Message.sender_id == user_id) & (models.Message.receiver_id == current_user.id)
        )
    ).order_by(models.Message.timestamp.asc()).all()
    return messages


# --- WebSockets for Real-time ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: int):
        if user_id in self.active_connections:
            del self.active_connections[user_id]

    async def send_personal_message(self, message: str, user_id: int):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_text(message)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str, db: Session = Depends(get_db)):
    # Authenticate via token query param
    payload = auth.decode_access_token(token)
    if not payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    username = payload.get("sub")
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    await manager.connect(websocket, user.id)
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # format: {"type": "chat", "receiver_id": 123, "encrypted_content": "...", "encrypted_aes_key": "..."}
            if message_data.get("type") == "chat":
                receiver_id = message_data["receiver_id"]
                encrypted_content = message_data["encrypted_content"]
                encrypted_aes_key = message_data["encrypted_aes_key"]
                
                # Verify friendship
                req = db.query(models.FriendRequest).filter(
                    or_(
                        (models.FriendRequest.sender_id == user.id) & (models.FriendRequest.receiver_id == receiver_id),
                        (models.FriendRequest.sender_id == receiver_id) & (models.FriendRequest.receiver_id == user.id)
                    ),
                    models.FriendRequest.status == "accepted"
                ).first()
                
                if req:
                    # Save to DB
                    new_msg = models.Message(
                        sender_id=user.id,
                        receiver_id=receiver_id,
                        encrypted_content=encrypted_content,
                        encrypted_aes_key=encrypted_aes_key
                    )
                    db.add(new_msg)
                    db.commit()
                    db.refresh(new_msg)
                    
                    # Forward to receiver
                    await manager.send_personal_message(json.dumps({
                        "type": "new_message",
                        "message": {
                            "id": new_msg.id,
                            "sender_id": new_msg.sender_id,
                            "receiver_id": new_msg.receiver_id,
                            "encrypted_content": new_msg.encrypted_content,
                            "encrypted_aes_key": new_msg.encrypted_aes_key,
                            "timestamp": new_msg.timestamp.isoformat()
                        }
                    }), receiver_id)
                    
                    # Also send back to sender for confirmation/sync
                    await manager.send_personal_message(json.dumps({
                         "type": "new_message",
                         "message": {
                            "id": new_msg.id,
                            "sender_id": new_msg.sender_id,
                            "receiver_id": new_msg.receiver_id,
                            "encrypted_content": new_msg.encrypted_content,
                            "encrypted_aes_key": new_msg.encrypted_aes_key,
                            "timestamp": new_msg.timestamp.isoformat()
                        }
                    }), user.id)

    except WebSocketDisconnect:
        manager.disconnect(user.id)
