# Complete Parse-Resume API Error Troubleshooting Guide

## All Possible Errors & Solutions

### HTTP Status Codes

| Code | Meaning | Cause |
|------|---------|-------|
| 200 | ✅ Success | File parsed successfully |
| 400 | Client error | Bad input (invalid file, unsupported type, etc.) |
| 405 | Method error | Used GET instead of POST |
| 500 | Server error | Temp directory or parsing issue |

---

## Error Scenarios & Fixes

### 1. **"Server configuration error"** (500)

**When:** First API call fails immediately  
**Cause:** Cannot find/create writable temp directory  

**Diagnosis:**
```
error: "Server configuration error"
details: "No writable temp directory found. Tried: [list of directories]"
```

**Solutions:**
- Vercel issue: Temp directories might be readonly in some regions
- Solution 1: Use `/tmp` (should always work on Vercel)
- Solution 2: Use `os.tmpdir()` (Node.js temp)
- Solution 3: Contact Vercel support about filesystem permissions

**Fixed in:** Latest commit - tries 5 different temp directory locations

---

### 2. **"No file uploaded"** (400)

**When:** API called without attaching file  
**Cause:** FormData doesn't include `file` field  

**Diagnosis:**
```
error: "No file uploaded"
details: "Please select a file to parse"
```

**Solutions:**
- Check client code: `formData.append('file', file)` must be present
- Verify file object is valid before sending
- Check browser console for upload errors

**Client-side check:**
```typescript
if (!file) {
  console.error('File is null/undefined');
  return;
}
const formData = new FormData();
formData.append('file', file); // ✓ Must be named 'file'
```

---

### 3. **"File upload failed"** (400)

**When:** FormData reaches API but fails to parse  
**Cause:** Formidable can't extract file from request

**Diagnosis:**
```
error: "File upload failed"
details: "Form parsing error: [specific error]"
```

**Possible causes & fixes:**
- File too large → Increase formidable `maxFileSize`
- Malformed FormData → Verify browser FormData API
- Network timeout → Retry upload
- Vercel timeout → Split into multiple smaller files

**Test locally:**
```bash
curl -F "file=@resume.pdf" http://localhost:3000/api/parse-resume
```

---

### 4. **"File upload error"** (400)

**When:** Formidable parses but file path is missing  
**Cause:** formidable output format varies by version

**Diagnosis:**
```
error: "File upload error"
details: "Uploaded file has no path"
```

**Solution:**
- Latest code checks both `.filepath` and `.path`
- If still fails, formidable version might be incompatible
- Try: `npm install formidable@latest`

---

### 5. **"Invalid file"** (400)

**When:** File has no extension  
**Cause:** User uploads file without extension (e.g., "resume" not "resume.pdf")

**Diagnosis:**
```
error: "Invalid file"
details: "File has no extension. Use .html, .docx, or .pdf"
```

**Solutions:**
- User must rename file to include extension
- Add client-side validation to reject before upload

**Client-side fix:**
```typescript
const ext = file.name.split('.').pop()?.toLowerCase();
if (!ext) {
  alert('File must have extension (.pdf, .docx, or .html)');
  return;
}
```

---

### 6. **"Unsupported file type"** (400)

**When:** File has unsupported extension  
**Cause:** User uploads .docx file as .doc or .xlsx or other format

**Diagnosis:**
```
error: "Unsupported file type: .doc"
details: "Supported formats: .html, .docx, .pdf"
```

**Solutions:**
- User must use exact extensions: `.html`, `.docx`, `.pdf`
- No `.doc` (convert to .docx in MS Word)
- No other formats supported

**User guidance:**
- Export resume as PDF from Word/Google Docs
- Save as HTML from browser
- Convert .doc to .docx in MS Word (File → Export)

---

### 7. **"Server error: Uploaded file not found"** (500)

**When:** File uploaded but not found at temp location  
**Cause:** Temp directory path is wrong or file deleted

**Diagnosis:**
```
error: "Server error"
details: "Uploaded file not found at: /path/to/file"
```

**Solutions:**
- Vercel filesystem issue
- Temp directory doesn't exist or is wrong
- File was deleted before parsing could happen

**Debugging:**
- Check Vercel function logs for uploadDir path
- Ensure /tmp or os.tmpdir() is writable
- Check file size isn't causing early deletion

---

### 8. **"Parse failed: HTML Error"** (400)

**When:** HTML file parsing fails  
**Causes:** Empty file, no readable text, file encoding issues

**Diagnosis:**
```
error: "Parse failed"
details: "HTML Error: [specific error]"
```

**Possible details:**
- "HTML file is empty" → File has no content
- "HTML contains no readable text" → Only HTML tags, no actual text
- "HTML file not found" → Temp file deleted before parsing

**Solutions:**
- Verify HTML file has actual text content
- Check file isn't corrupted
- Try re-exporting from browser/editor

---

### 9. **"Parse failed: DOCX Error"** (400)

**When:** DOCX file parsing fails  
**Causes:** Mammoth can't extract text, corrupt file, encrypted

**Diagnosis:**
```
error: "Parse failed"
details: "DOCX Error: [specific error]"
```

**Possible details:**
- "DOCX file contains no extractable text" → File is empty or image-only
- Other errors → File is corrupted or encrypted

**Solutions:**
- Open DOCX in MS Word, ensure it has text
- Save fresh copy of DOCX
- Try exporting resume as PDF instead
- Check file isn't password-protected

**Manual test:**
```bash
node -e "
const mammoth = require('mammoth');
mammoth.extractRawText({ path: './resume.docx' })
  .then(r => console.log(r.value))
  .catch(e => console.error(e));
"
```

---

### 10. **"Parse failed: PDF Error"** (400)

**When:** PDF parsing fails  
**Causes:** pdf-parse can't extract text, image-based PDF, encrypted

**Diagnosis:**
```
error: "Parse failed"
details: "PDF Error: [specific error]"
```

**Possible details:**
- "PDF file is empty or unreadable" → Corrupted PDF
- "No text extracted from PDF — file may be image-based" → Scanned resume
- "PDF contains no readable text" → No selectable text in PDF
- Other errors → PDF is encrypted or unusual format

**Solutions:**
- For image-based PDFs: Use OCR tool online, convert to PDF with text layer
- For encrypted PDFs: Remove password in Adobe Reader
- For corrupted PDFs: Re-save from original source
- Fallback: Upload as HTML or DOCX instead

**Manual test:**
```bash
node -e "
const PDFParse = require('pdf-parse');
const fs = require('fs');
const buf = fs.readFileSync('./resume.pdf');
PDFParse(buf).then(r => console.log(r.text.substring(0, 200)))
  .catch(e => console.error(e));
"
```

---

### 11. **"No text extracted"** (400)

**When:** File parsed but contains no readable text  
**Cause:** File exists but is empty or only contains formatting

**Diagnosis:**
```
error: "No text extracted"
details: "File exists but contains no readable text. Try a different file format."
```

**Solutions:**
- HTML: Ensure file has actual text, not just `<div></div>`
- DOCX: Ensure Word document has body text
- PDF: Ensure PDF has selectable text (not scanned image)
- Fallback: Try different format

**User guidance:**
- Copy/paste your resume text into a new document
- Save as HTML or PDF with text layer
- Avoid fancy formatting that might not parse

---

### 12. **"Method not allowed"** (405)

**When:** API called with wrong HTTP method  
**Cause:** Using GET or PUT instead of POST

**Solution:**
```typescript
// ✓ Correct
fetch('/api/parse-resume', { 
  method: 'POST',  // Must be POST
  body: formData 
})

// ✗ Wrong
fetch('/api/parse-resume') // Defaults to GET
```

---

### 13. **"Form parsing error"** (400)

**When:** formidable fails to parse the request  
**Cause:** Malformed request, corrupted data, network issue

**Diagnosis:**
```
error: "File upload failed"
details: "Form parsing error: [specific error]"
```

**Solutions:**
- Browser/mobile issue: Refresh and retry
- Network timeout: Check internet connection
- File size: Ensure file under 50MB limit
- Formidable bug: Try `npm update formidable`

---

### 14. **Timeout Error (No response)**

**When:** Request hangs and times out  
**Cause:** Large file, slow parsing, Vercel timeout

**Vercel limits:**
- Default timeout: 10 seconds
- Max timeout: 60 seconds (depends on plan)

**Solutions:**
- Smaller files: Split large resume into multiple sections
- Compression: Compress PDF before upload
- Upgrade plan: Pro/Enterprise plans have longer timeouts
- Check browser timeout: Might be browser timing out first

**Test upload size:**
```bash
# Check file size
ls -lh resume.pdf

# Expected parse times:
# < 1MB: < 1 second
# 1-5MB: 1-3 seconds  
# > 5MB: 3+ seconds (risky on Vercel)
```

---

## Complete Error Decision Tree

```
API Call Fails
├─ HTTP 405 → Using wrong method (need POST)
├─ HTTP 400 → Client error
│  ├─ "No file uploaded" → FormData missing file field
│  ├─ "File upload failed" → Formidable parse error
│  ├─ "File upload error" → File path missing
│  ├─ "Invalid file" → No extension
│  ├─ "Unsupported file type" → Wrong extension
│  ├─ "Parse failed: ..." → Parsing error (HTML/DOCX/PDF)
│  └─ "No text extracted" → File empty or formatting-only
├─ HTTP 500 → Server error
│  ├─ "Server configuration error" → Temp dir issue
│  └─ "Server error" → Other server problem
└─ Timeout → Too large or slow parsing
```

---

## Testing Checklist

- [ ] Upload small HTML file (~10KB) → Should work
- [ ] Upload small DOCX file (~50KB) → Should work
- [ ] Upload small PDF file (~100KB text-based) → Should work
- [ ] Upload image-based PDF → Should get "image-based" error
- [ ] Upload empty file → Should get "no text extracted" error
- [ ] Upload file without extension → Should get "invalid file" error
- [ ] Upload unsupported format (.doc, .xlsx) → Should get "unsupported" error
- [ ] Upload 50MB+ file → Should timeout or error
- [ ] Test on mobile (iOS Safari, Android Chrome) → Should work same as desktop

---

## Debugging Tools

### View Vercel Logs
```bash
vercel logs production
```

### Test API Locally
```bash
# Start local dev server
npm run dev

# In another terminal, test with curl
curl -F "file=@resume.pdf" http://localhost:3000/api/parse-resume
```

### Test Parsing Functions Directly
```bash
node -e "
// Test HTML
const html = '<p>Hello</p>';
const text = html.replace(/<[^>]*>/g, ' ').trim();
console.log('HTML:', text);

// Test pdf-parse
const PDFParse = require('pdf-parse');
const fs = require('fs');
PDFParse(fs.readFileSync('./resume.pdf'))
  .then(d => console.log('PDF text length:', d.text.length))
  .catch(e => console.error('PDF error:', e.message));

// Test mammoth
const mammoth = require('mammoth');
mammoth.extractRawText({ path: './resume.docx' })
  .then(r => console.log('DOCX text length:', r.value.length))
  .catch(e => console.error('DOCX error:', e.message));
"
```

---

## Still Having Issues?

1. **Check Vercel logs:** vercel.com dashboard → Function logs
2. **Test locally first:** `npm run dev` and upload locally
3. **Simplify test:** Start with small HTML file
4. **Check file:** Ensure resume actually has readable text
5. **Check network:** Ensure stable internet connection
6. **Check size:** Ensure file under 50MB
7. **Check format:** Ensure .html, .docx, or .pdf (exact extensions)

---

**Status:** All errors documented, all solutions provided. Ready for production testing.
