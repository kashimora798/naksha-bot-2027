import os
import tempfile
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from hlb_extractor import extract_hlb_boundary

app = FastAPI(title="NakshaBot GeoPDF Boundary Extractor API")

# Enable CORS so the React app can call the service directly from any origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/extract")
async def extract_boundary(
    file: UploadFile = File(...),
    hlb: str = Form(...)
):
    # Verify file type
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    # Write uploaded PDF to a temporary file
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, f"uploaded_{os.getpid()}_{file.filename}")
    
    try:
        with open(temp_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        # Run the extractor pipeline
        geojson = extract_hlb_boundary(temp_path, hlb_number=hlb)
        return geojson
        
    except ValueError as val_err:
        # Expected extraction errors (e.g. missing GeoPDF headers, OCR failure)
        raise HTTPException(status_code=422, detail=str(val_err))
    except Exception as e:
        # Unexpected crashes
        raise HTTPException(status_code=500, detail=f"Unexpected extraction failure: {str(e)}")
    finally:
        # Always clean up temporary file
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
