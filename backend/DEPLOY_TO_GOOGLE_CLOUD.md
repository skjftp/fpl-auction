# Deploy to Google Cloud Run

## Prerequisites

1. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install
2. Create a Google Cloud Project
3. Enable required APIs

## Setup Steps

### 1. Install and Initialize gcloud

```bash
# Install gcloud SDK (if not already installed)
# On macOS:
brew install --cask google-cloud-sdk

# Initialize gcloud and login
gcloud init
gcloud auth login
```

### 2. Create a New Project (or use existing)

```bash
# Create new project (optional)
gcloud projects create fpl-auction-backend --name="FPL Auction Backend"

# Set the project
gcloud config set project fpl-auction-backend
```

### 3. Enable Required APIs

```bash
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

### 4. Deploy to Cloud Run

Option A: Using Cloud Build (Recommended)
```bash
# From the backend directory
cd backend

# Submit build (this will build and deploy)
gcloud builds submit --config cloudbuild.yaml
```

Option B: Manual deployment
```bash
# Build locally
docker build -t gcr.io/[PROJECT-ID]/fpl-auction-backend .

# Push to Container Registry
docker push gcr.io/[PROJECT-ID]/fpl-auction-backend

# Deploy to Cloud Run
gcloud run deploy fpl-auction-backend \
  --image gcr.io/[PROJECT-ID]/fpl-auction-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,DB_PATH=/tmp/fpl_auction.db \
  --memory 512Mi
```

### 5. Get the Service URL

After deployment, you'll get a URL like:
```
https://fpl-auction-backend-xxxxx-uc.a.run.app
```

### 6. Update Frontend

Update the API URL in your frontend code to use the new Cloud Run URL.

## Important Notes

1. **Database**: Cloud Run uses ephemeral storage. The SQLite database will be reset when the container restarts. For production, consider using Cloud SQL or Firestore.

2. **Cold Starts**: Cloud Run scales to zero. First requests after idle time may be slower.

3. **Costs**: Cloud Run has a generous free tier:
   - 2 million requests per month
   - 360,000 GB-seconds of memory
   - 180,000 vCPU-seconds of compute time

4. **Environment Variables**: Set these in Cloud Run:
   - `NODE_ENV=production`
   - `DB_PATH=/tmp/fpl_auction.db`
   - `FRONTEND_URL=https://fpl-auction.netlify.app`

## Monitoring

View logs:
```bash
gcloud run services logs read fpl-auction-backend --limit=50
```

View service details:
```bash
gcloud run services describe fpl-auction-backend --region=us-central1
```