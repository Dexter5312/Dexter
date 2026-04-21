import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        # User 1
        page1 = await browser.new_page()
        page1.on("console", lambda msg: print(f"P1 Console: {msg.text}"))
        page1.on("pageerror", lambda err: print(f"P1 Error: {err}"))
        
        # User 2
        page2 = await browser.new_page()
        page2.on("console", lambda msg: print(f"P2 Console: {msg.text}"))
        page2.on("pageerror", lambda err: print(f"P2 Error: {err}"))
        
        print("Registering P1")
        await page1.goto("http://127.0.0.1:8080")
        await page1.click("text=Register")
        await page1.fill("#username", "alpha")
        await page1.fill("#password", "password")
        await page1.click("button:has-text('Register')")
        await page1.wait_for_selector("#current-username", state="visible")
        
        print("Registering P2")
        await page2.goto("http://127.0.0.1:8080")
        await page2.click("text=Register")
        await page2.fill("#username", "beta")
        await page2.fill("#password", "password")
        await page2.click("button:has-text('Register')")
        await page2.wait_for_selector("#current-username", state="visible")
        
        print("P1 sending request to P2")
        await page1.click("text=Friends & Requests")
        await page1.fill("#search-username", "beta")
        page1.on("dialog", lambda dialog: dialog.accept())
        await page1.click("button:has-text('Send Request')")
        await asyncio.sleep(1)
        
        print("P2 accepting request")
        await page2.click("text=Friends & Requests")
        await asyncio.sleep(1)
        await page2.click("button.accept")
        await asyncio.sleep(1)
        
        print("P1 opening chat")
        await page1.click("text=beta") # Click the friend item
        await asyncio.sleep(1)
        
        is_chat_visible = await page1.is_visible("#chat-active")
        print(f"Chat visible for P1: {is_chat_visible}")
        
        if not is_chat_visible:
            print(f"Chat placeholder visible: {await page1.is_visible('#chat-placeholder')}")
            print(f"Requests view visible: {await page1.is_visible('#requests-view')}")
            
        await browser.close()

asyncio.run(main())
