# 📊 Rafli Finance Tracker

A modern, mobile-friendly personal finance tracker integrated directly with **Google Sheets**. Built with React, Tailwind CSS, and Express.

## ✨ Features

- **Google OAuth Integration**: Securely connect your Google account.
- **Google Sheets as Database**: All your data is stored in your own spreadsheet.
- **Real-time Dashboard**: Track your total balance, income, and expenses.
- **Interactive Charts**: Visualize your spending habits with bar and pie charts.
- **Transaction History**: Search, filter, and delete transactions.
- **Automatic Setup**: One-click initialization of your spreadsheet tab.
- **Responsive Design**: Optimized for both mobile and desktop.

## 🚀 Getting Started

### 1. Prerequisites

- A Google Cloud Project with **Google Sheets API** and **Google Drive API** enabled.
- OAuth 2.0 Client ID and Secret from Google Cloud Console.

### 2. Environment Variables

Create a `.env` file in the root directory (use `.env.example` as a template):

```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
APP_URL=https://your-app-url.run.app
```

### 3. Google Cloud Configuration

1.  Go to [Google Cloud Console](https://console.cloud.google.com/).
2.  Enable **Google Sheets API** and **Google Drive API**.
3.  In **OAuth consent screen**, add your email to **Test users**.
4.  In **Credentials**, add the following **Authorized redirect URIs**:
    - `https://your-app-url.run.app/auth/callback`

### 4. Installation

```bash
npm install
```

### 5. Development

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

## 🛠️ Tech Stack

- **Frontend**: React, Tailwind CSS, Framer Motion, Lucide React, Recharts.
- **Backend**: Node.js, Express, Google APIs Client Library.
- **Build Tool**: Vite.

## 📝 License

MIT
