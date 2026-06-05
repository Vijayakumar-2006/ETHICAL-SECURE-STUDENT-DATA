from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.exceptions import RequestValidationError
import uvicorn
import os
import traceback

from routes import auth, student

# 1. Disable default Swagger UI routes to secure endpoints
app = FastAPI(
    title="Secure Student Data Storage System",
    docs_url=None,
    redoc_url=None,
    openapi_url=None
)

# 2. Setup CORS origins restricted to FRONTEND_URL
frontend_url = os.environ.get("FRONTEND_URL", "http://127.0.0.1:8001")
origins = [frontend_url]
if "127.0.0.1" in frontend_url:
    origins.append(frontend_url.replace("127.0.0.1", "localhost"))
elif "localhost" in frontend_url:
    origins.append(frontend_url.replace("localhost", "127.0.0.1"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Dynamic HTTPS Redirect
require_https = os.environ.get("REQUIRE_HTTPS", "false").lower() == "true"
if require_https:
    from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
    app.add_middleware(HTTPSRedirectMiddleware)

# 4. HTTP Basic Authentication for custom API Docs
security_basic = HTTPBasic()

def verify_docs_credentials(credentials: HTTPBasicCredentials = Depends(security_basic)):
    correct_username = os.environ.get("DOCS_USERNAME", "admin")
    correct_password = os.environ.get("DOCS_PASSWORD", "secure@123")
    if credentials.username != correct_username or credentials.password != correct_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

@app.get("/docs", include_in_schema=False)
async def get_swagger_documentation(username: str = Depends(verify_docs_credentials)):
    return get_swagger_ui_html(openapi_url="/openapi.json", title="Docs")

@app.get("/redoc", include_in_schema=False)
async def get_redoc_documentation(username: str = Depends(verify_docs_credentials)):
    return get_redoc_html(openapi_url="/openapi.json", title="ReDoc")

@app.get("/openapi.json", include_in_schema=False)
async def get_openapi_spec(username: str = Depends(verify_docs_credentials)):
    return get_openapi(title=app.title, version=app.version, routes=app.routes)

# 5. Secure Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    # Allow local connections and inline styling for portal design
    response.headers["Content-Security-Policy"] = (
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com https://fonts.gstatic.com; "
        "img-src 'self' data: http://127.0.0.1:8001 http://localhost:8001; "
        "connect-src 'self' http://127.0.0.1:8001 http://localhost:8001;"
    )
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# 6. Global Exception Handlers to Hide Stack Trace info
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please contact the administrator."},
    )

# Routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(student.router, prefix="/api/students", tags=["students"])

# Serve frontend static files
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/frontend", StaticFiles(directory=frontend_dir), name="frontend")

# Serve uploads files
uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
if not os.path.exists(uploads_dir):
    os.makedirs(uploads_dir)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

@app.get("/")
def read_root():
    return RedirectResponse(url="/frontend/index.html")

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=True)
