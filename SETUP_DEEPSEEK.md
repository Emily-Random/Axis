# DeepSeek API Setup Guide

## Quick Fix

1. **Get your DeepSeek API key:**
   - Go to https://platform.deepseek.com/
   - Sign up or log in
   - Navigate to API Keys section
   - Create a new API key or copy an existing one

2. **Add the API key to your `.env` file:**
   - Open `/Users/emilytang/WAICY_planner/.env`
   - Replace `your_deepseek_api_key_here` with your actual API key
   - The line should look like: `DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxx`

3. **Restart the server:**
   ```bash
   # Stop the current server (Ctrl+C)
   # Then restart:
   node server.js
   ```

4. **Test it:**
   - Open the app in your browser
   - Try sending a message in the chatbot
   - Check the server terminal for any errors

## Troubleshooting

### Error: "Authentication Fails, Your api key is invalid"
- Make sure you copied the entire API key (it usually starts with `sk-`)
- Check for extra spaces or quotes in the `.env` file
- Restart the server after changing `.env`

### Error: "DEEPSEEK_API_KEY is not configured"
- Make sure the `.env` file exists in the project root
- Check that the line starts with `DEEPSEEK_API_KEY=` (no spaces around the `=`)
- Restart the server

### Error: "Upstream DeepSeek API error"
- Check your internet connection
- Verify your API key has credits/quota available
- Check DeepSeek's status page: https://status.deepseek.com/

### Model Name Issues
If you get model-related errors, you may need to update the model name in `server.js` line 50. Common model names:
- `deepseek-chat` (default)
- `deepseek-reasoner`
- `deepseek-coder`

## Example .env file

```
DEEPSEEK_API_KEY=sk-your-actual-api-key-here
PORT=3000
```

**Important:** Never commit your `.env` file to git! It contains sensitive information.

