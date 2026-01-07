# LLM API Setup Guide (DeepSeek / OpenAI / Gemini)

## Quick Fix

Axis supports multiple LLM providers via `AI_PROVIDER`:

- `deepseek` (default): set `DEEPSEEK_API_KEY` (optional: `DEEPSEEK_MODEL`, `DEEPSEEK_BASE_URL`)
- `openai`: set `OPENAI_API_KEY` (optional: `OPENAI_MODEL`, `OPENAI_BASE_URL`)
- `gemini`: set `GEMINI_API_KEY` (optional: `GEMINI_MODEL`, `GEMINI_BASE_URL`)

1. **Create your `.env` file:**
   - Copy `.env.example` → `.env` (in the project root)

2. **Set `JWT_SECRET`:**
   - Use a long random string (>= 32 chars)

3. **Choose a provider + set its key:**
   - DeepSeek: `AI_PROVIDER=deepseek` + `DEEPSEEK_API_KEY=...`
   - OpenAI: `AI_PROVIDER=openai` + `OPENAI_API_KEY=...`
   - Gemini: `AI_PROVIDER=gemini` + `GEMINI_API_KEY=...`

4. **Restart the server:**
   ```bash
   # Stop the current server (Ctrl+C)
   # Then restart:
   npm run dev
   ```

5. **Test it:**
   - Open the app in your browser
   - Try sending a message in the chatbot
   - Check the server terminal for any errors

## Troubleshooting

### Error: "API key is not configured"
- Make sure your `.env` exists in the project root
- Ensure `AI_PROVIDER` matches the key you set:
  - `deepseek` → `DEEPSEEK_API_KEY`
  - `openai` → `OPENAI_API_KEY`
  - `gemini` → `GEMINI_API_KEY`
- Restart the server after changing `.env`

### Error: "Upstream API error"
- Check your internet connection
- Verify your API key has credits/quota available
- If using DeepSeek, check status: https://status.deepseek.com/

### Model Name Issues
If you get model-related errors, set the model env var for your provider. Examples:
- `deepseek-chat` (default)
- `deepseek-reasoner`
- `deepseek-coder`
- `gpt-4o-mini` (OpenAI example)
- `gemini-1.5-flash` (Gemini example)

## Example .env file

```
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-actual-api-key-here
JWT_SECRET=change-me-to-a-long-random-string
PORT=3000
```

**Important:** Never commit your `.env` file to git! It contains sensitive information.
