# Wanderlust

Express + MongoDB + EJS app with authentication, listings, reviews, Cloudinary image uploads, and Mapbox maps.

## Run locally

### 1) Install

```bash
npm install
```

### 2) Environment variables

Create a `.env` file in the project root (it is ignored by git).

Required keys:

- `ATLASDB_URL` (MongoDB connection string)
- `SECRET` (session secret)
- `MAP_TOKEN` (Mapbox token)
- `CLOUD_NAME` (Cloudinary)
- `CLOUD_API_KEY` (Cloudinary)
- `CLOUD_API_SECRET` (Cloudinary)
- `RAZORPAY_KEY_ID` (Razorpay)
- `RAZORPAY_KEY_SECRET` (Razorpay)

Tip: copy from `.env.example` and fill values.

### 3) Start the server

```bash
npm start
```

Then open:

- `http://localhost:8080/`

## Notes

- Node engine is defined in `package.json`.
- //completed 
