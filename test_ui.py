import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        # Capture console errors
        page.on("console", lambda msg: print(f"Browser Console: {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"Browser Error: {err}"))
        
        await page.goto("http://127.0.0.1:8080")
        
        # Register user
        print("Registering user")
        await page.click("text=Register")
        await page.fill("#username", "testuser3")
        await page.fill("#password", "password")
        await page.click("button:has-text('Register')")
        
        await page.wait_for_selector("#current-username", state="visible")
        print("Logged in successfully")
        
        # Click Friends & Requests
        print("Clicking Friends & Requests")
        await page.click("text=Friends & Requests")
        
        # Send friend request to a non-existent user to trigger alert
        print("Sending friend request")
        page.on("dialog", lambda dialog: dialog.accept()) # Auto-accept alerts
        await page.fill("#search-username", "testuser4")
        await page.click("button:has-text('Send Request')")
        
        await asyncio.sleep(1) # wait for alert
        
        # Try logging out
        print("Clicking logout")
        await page.click("button[title='Logout']")
        
        await asyncio.sleep(1)
        
        if await page.is_visible("#auth-form"):
            print("Logout successful")
        else:
            print("Logout failed")

        await browser.close()

asyncio.run(main())
