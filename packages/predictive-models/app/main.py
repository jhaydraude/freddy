"""Main FastAPI application."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.routers import train, predict, glucose, profile, profile_estimation, profile_analysis, situation
from app.utils.logging import setup_logging

# Setup logging
setup_logging()

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="A microservice for training and serving predictive models",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(train.router, prefix="/api/v1", tags=["training"])
app.include_router(predict.router, prefix="/api/v1", tags=["prediction"])
app.include_router(glucose.router, prefix="/api/v1", tags=["glucose-prediction"])
app.include_router(profile.router, prefix="/api/v1", tags=["profile-tuning"])
app.include_router(profile_estimation.router, prefix="/api/v1", tags=["profile-estimation"])
app.include_router(profile_analysis.router, prefix="/api/v1", tags=["profile-analysis"])
app.include_router(situation.router, prefix="/api/v1", tags=["situation"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "service": settings.app_name,
            "version": settings.app_version
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True if settings.environment == "development" else False
    )
