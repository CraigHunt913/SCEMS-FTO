# Fix blank / grey portal screen

That empty grey iframe is Google stuck on **Authorize**, not THE LINE failing to draw.

## Do these in order (Portal project only)

1. Open **SCEMS Portal** → Apps Script editor (not the tracker).

2. Paste the latest  
   [`SCEMS_PORTAL_ONE_FILE.gs`](https://github.com/CraigHunt913/SCEMS-FTO/blob/cursor/the-line-product-adde/portal/SCEMS_PORTAL_ONE_FILE.gs)  
   over `Code.gs`. Scroll to the bottom — you must see **END OF FILE**. Save.

3. Run **`authorizePortalNow`** from the function dropdown.  
   Finish every Google permission screen  
   (**Advanced → Go to SCEMS Portal (unsafe)** is normal for your own app).

4. **Deploy → Manage deployments → Edit (pencil)**  
   - Execute as: **Me**  
   - Who has access: **Anyone with a Google account**  
     (not “Anyone” — that leaves you unnamed and empty)  
   - Version: **New version**  
   - Deploy

5. Open the **/exec** link in an **Incognito** window, signed into **one** Google account only.

You should see navy **THE LINE** chrome and “Opening…”, then your desk — or a clear error with next steps.
