# Setup

This takes about 20 minutes. You need a Google account and the GitHub repository `agrointel-africa`.
Keep the service-account key private: never paste it into chats, issues or code.

## 1. Earth Engine project (noncommercial)

1. Open https://code.earthengine.google.com and sign in.
2. Register a Cloud project for **noncommercial** use, as an **individual**. This project uses `ee-aasobbur`.
3. In the Google Cloud console (https://console.cloud.google.com), select that project and make sure the **Earth Engine API** is enabled (APIs & Services → Library → "Earth Engine API" → Enable).

## 2. Service account for the weekly run

1. Cloud console → **IAM & Admin → Service Accounts → Create service account**.
   * Name: `agrointel-pipeline`.
2. Grant it these roles:
   * **Earth Engine Resource Writer** (`roles/earthengine.writer`), needed to create map images
   * **Service Usage Consumer** (`roles/serviceusage.serviceUsageConsumer`)
3. Open the new service account → **Keys → Add key → Create new key → JSON**. A `.json` file downloads.

## 3. Add the key to GitHub

1. GitHub repository → **Settings → Secrets and variables → Actions → New repository secret**.
2. Name: `EE_SERVICE_ACCOUNT_KEY`. Value: open the JSON file in a text editor and paste its whole contents.
3. Optional: under the **Variables** tab, add `EE_PROJECT` = `ee-aasobbur` (this is already the default).
4. Delete the downloaded JSON file from your computer once it is saved in GitHub.

## 4. Turn on GitHub Pages

Repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## 5. First run

1. Repository → **Actions → Earth Engine pipeline → Run workflow**.
2. The first run builds the history (CHIRPS since 1991, MODIS since 2001), so allow up to an hour or two. Later weekly runs take a few minutes.
3. When it finishes, the **Deploy site** workflow publishes the site at `https://abdul-sobbur.github.io/agrointel-africa/`.

If a run fails, open it in the Actions tab; the error usually names the dataset or permission involved.

## Running locally (optional)

```bash
pip install -r pipelines/requirements.txt
earthengine authenticate          # opens a browser sign-in
EE_PROJECT=ee-aasobbur python pipelines/run_pipeline.py --no-maps
python -m http.server -d web 8000
```

## Going commercial later

The noncommercial tier does not allow charging for the service or doing work for organisations. To commercialise, create a new Cloud project registered for commercial Earth Engine use, add a new key, update `EE_PROJECT`, and rerun with `--rebuild`. Do not convert this project.
