from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
import logging
import joblib
import sys

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

print("="*60)
print("Starting Unified Phishing Detection API...")
print("Loading libraries (this may take 30-60 seconds on first run)...")
print("="*60)
sys.stdout.flush()

# Import transformers for email model
print("Loading transformers...")
sys.stdout.flush()
from transformers import DistilBertTokenizer, DistilBertForSequenceClassification

print("Loading torch...")
sys.stdout.flush()
import torch

print("✓ All libraries loaded successfully!")
print("="*60)
sys.stdout.flush()

# Initialize FastAPI app
app = FastAPI(
    title="Unified Phishing Detection API",
    description="Detect phishing in both URLs and Emails",
    version="1.0"
)

# Enable CORS for browser extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables for URL model
url_model = None
url_vectorizer = None

# Global variables for Email model
email_model = None
email_tokenizer = None
device = None

# Label mapping
LABEL_MAP = {
    0: "legitimate",
    1: "phishing"
}

# ============================================
# REQUEST/RESPONSE MODELS
# ============================================

# URL Models
class URLRequest(BaseModel):
    url: str

class URLPredictionResponse(BaseModel):
    url: str
    prediction: str
    label: int
    timestamp: str

# Email Models
class EmailRequest(BaseModel):
    sender: str
    subject: str
    body: str

class EmailPredictionResponse(BaseModel):
    prediction: str
    confidence: float
    label: int
    processed_date: str

# ============================================
# STARTUP: LOAD MODELS
# ============================================

@app.on_event("startup")
async def load_models():
    """Load both URL and Email models on startup"""
    global url_model, url_vectorizer, email_model, email_tokenizer, device
    
    try:
        logger.info("="*60)
        logger.info("LOADING URL CLASSIFIER MODEL")
        logger.info("="*60)
        
        # Load URL model
        url_model_path = './url/logreg_phishing_model/url_classifier_lr_model.pkl'
        url_vectorizer_path = './url/logreg_phishing_model/url_vectorizer.pkl'
        
        logger.info("Loading URL model...")
        url_model = joblib.load(url_model_path)
        
        logger.info("Loading URL vectorizer...")
        url_vectorizer = joblib.load(url_vectorizer_path)
        
        logger.info("✓ URL MODEL LOADED SUCCESSFULLY!")
        
        # Load Email model
        logger.info("="*60)
        logger.info("LOADING EMAIL CLASSIFIER MODEL")
        logger.info("="*60)
        
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Using device: {device}")
        
        email_model_path = "./email/distilbert_phishing_model"
        
        logger.info("Loading email tokenizer...")
        email_tokenizer = DistilBertTokenizer.from_pretrained(email_model_path)
        
        logger.info("Loading email model weights...")
        email_model = DistilBertForSequenceClassification.from_pretrained(email_model_path)
        email_model.to(device)
        email_model.eval()
        
        logger.info("✓ EMAIL MODEL LOADED SUCCESSFULLY!")
        logger.info("="*60)
        logger.info("✓ ALL MODELS READY TO SERVE REQUESTS!")
        logger.info("="*60)
        
    except Exception as e:
        logger.error(f"✗ Error loading models: {str(e)}")
        raise

# ============================================
# GENERAL ENDPOINTS
# ============================================

@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "status": "running",
        "service": "Unified Phishing Detection API",
        "models": {
            "url": "Logistic Regression with TF-IDF",
            "email": "DistilBERT"
        },
        "version": "1.0",
        "endpoints": {
            "url_predict": "/predict",
            "email_predict": "/predict_email",
            "health": "/health"
        }
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy",
        "url_model_loaded": url_model is not None,
        "email_model_loaded": email_model is not None,
        "device": str(device) if device else None,
        "timestamp": datetime.now().isoformat()
    }

# ============================================
# URL PREDICTION ENDPOINTS
# ============================================

@app.post("/predict", response_model=URLPredictionResponse)
async def predict_url(request: URLRequest):
    """
    Predict if a URL is phishing or legitimate
    """
    try:
        if url_model is None or url_vectorizer is None:
            raise HTTPException(
                status_code=503,
                detail="URL model not loaded. Please check server logs."
            )
        
        logger.info(f"Processing URL: {request.url}")
        
        # Vectorize the URL
        url_vectorized = url_vectorizer.transform([request.url])
        
        # Make prediction
        prediction = url_model.predict(url_vectorized)[0]
        pred_label = int(prediction)
        pred_text = LABEL_MAP[pred_label]
        
        logger.info(f"URL Prediction: {pred_text} (label: {pred_label})")
        
        return URLPredictionResponse(
            url=request.url,
            prediction=pred_text,
            label=pred_label,
            timestamp=datetime.now().isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during URL prediction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"URL prediction failed: {str(e)}")

# ============================================
# EMAIL PREDICTION ENDPOINTS
# ============================================

@app.post("/predict_email", response_model=EmailPredictionResponse)
async def predict_email(request: EmailRequest):
    """
    Predict if an email is phishing or legitimate
    """
    try:
        if email_model is None or email_tokenizer is None:
            raise HTTPException(status_code=503, detail="Email model not loaded")
        
        # Automatically use current system date
        email_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        email_text = request.body
        
        logger.info(f"Processing email from: {request.sender} at {email_date}")
        
        # Tokenize input
        inputs = email_tokenizer(
            email_text,
            truncation=True,
            padding=True,
            max_length=512,
            return_tensors="pt"
        )
        
        inputs = {key: val.to(device) for key, val in inputs.items()}
        
        # Make prediction
        with torch.no_grad():
            outputs = email_model(**inputs)
            logits = outputs.logits
            probabilities = torch.softmax(logits, dim=1)
            confidence, predicted_class = torch.max(probabilities, dim=1)
        
        pred_label = predicted_class.item()
        pred_confidence = confidence.item()
        pred_text = LABEL_MAP[pred_label]
        
        logger.info(f"Email Prediction: {pred_text} (confidence: {pred_confidence:.4f})")
        
        return EmailPredictionResponse(
            prediction=pred_text,
            confidence=round(pred_confidence, 4),
            label=pred_label,
            processed_date=email_date
        )
        
    except Exception as e:
        logger.error(f"Error during email prediction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Email prediction failed: {str(e)}")

# ============================================
# BATCH ENDPOINTS
# ============================================

@app.post("/predict_batch_url")
async def predict_urls_batch(urls: list[str]):
    """Batch prediction for multiple URLs"""
    try:
        results = []
        for url in urls:
            result = await predict_url(URLRequest(url=url))
            results.append(result)
        return {"predictions": results, "total": len(urls)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch URL prediction failed: {str(e)}")

@app.post("/predict_batch_email")
async def predict_emails_batch(emails: list[EmailRequest]):
    """Batch prediction for multiple emails"""
    try:
        results = []
        for email in emails:
            result = await predict_email(email)
            results.append(result)
        return {"predictions": results, "total": len(emails)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch email prediction failed: {str(e)}")

# ============================================
# RUN SERVER
# ============================================

if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*60)
    print("Starting Unified FastAPI server...")
    print("API will be available at: http://localhost:8000")
    print("Interactive docs at: http://localhost:8000/docs")
    print("="*60 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)
