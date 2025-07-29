#!/bin/bash

# Deploy script with proper environment variables for CORS fix

echo "Deploying FPL Auction Backend with CORS fixes..."

# Deploy with environment variables
gcloud run deploy fpl-auction-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,FRONTEND_URL=https://fpl-auction.netlify.app" \
  --project fpl-auction-2025

echo "Deployment complete!"
echo "Getting service URL..."

# Get the service URL
gcloud run services describe fpl-auction-backend \
  --region us-central1 \
  --project fpl-auction-2025 \
  --format="value(status.url)"