/**
 * LLM Integration — Groq API callLLM function
 */
async function callLLM(apiKey, userMessage, executionResults, conversationHistory) {
  const systemPrompt = `You are Agent Nexus Brain — an autonomous AI agent operating on X Layer blockchain (Chain 196). You execute real on-chain operations via OnchainOS APIs.

Your capabilities:
- Token swaps via DEX Aggregator (500+ liquidity sources)
- Security scanning (honeypot detection, contract risk analysis)
- Wallet balance queries
- Real-time token price lookups
- x402 payment protocol for agent-to-agent micropayments
- Service marketplace management

When responding:
- Be concise but informative (2-4 sentences)
- Include specific numbers from execution results
- Mention risk levels for security scans
- Compare routes for swaps
- Use professional financial language
- Support both English and Chinese based on user's language`;

  const messages = [
    { role: 'system', content: systemPrompt },
  ];

  // Add conversation history
  if (Array.isArray(conversationHistory)) {
    for (const msg of conversationHistory.slice(-6)) {
      messages.push({ role: msg.role === 'agent' ? 'assistant' : 'user', content: msg.content || '' });
    }
  }

  // Add current message with execution context
  messages.push({
    role: 'user',
    content: `User command: "${userMessage}"\n\nExecution results:\n- Intent: ${executionResults.intent}\n- Steps completed: ${executionResults.steps?.length || 0}\n- Raw response: ${executionResults.response}\n- Data summary: ${JSON.stringify(executionResults.data || {}).slice(0, 500)}\n\nGenerate a clear, helpful response summarizing the results.`
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 300,
        temperature: 0.7,
        stream: false,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

module.exports = { callLLM };
