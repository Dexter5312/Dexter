from pydantic import BaseModel
from typing import Optional, List
import datetime

class UserCreate(BaseModel):
    username: str
    password: str
    public_key: str

class UserResponse(BaseModel):
    id: int
    username: str
    public_key: str
    display_name: Optional[str] = None
    bio: Optional[str] = None

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class FriendRequestCreate(BaseModel):
    receiver_username: str

class FriendRequestResponse(BaseModel):
    id: int
    sender: UserResponse
    receiver: UserResponse
    status: str

    class Config:
        from_attributes = True

class MessageCreate(BaseModel):
    receiver_id: int
    encrypted_content: str
    encrypted_aes_key: str

class MessageResponse(BaseModel):
    id: int
    sender_id: int
    receiver_id: int
    encrypted_content: str
    encrypted_aes_key: str
    timestamp: datetime.datetime

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    username: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
