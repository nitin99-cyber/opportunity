const dns = require("dns").promises;
const { URL } = require("url");

function isPrivateIP(ip) {
  if (!ip) return true;
  // Normalize IPv6 mapped IPv4 e.g. ::ffff:127.0.0.1
  if (ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }

  // IPv4 checks
  const parts = ip.split(".").map(Number);
  if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 10.0.0.0/8 (Private)
    if (parts[0] === 10) return true;
    // 172.16.0.0/12 (Private)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (Link-local / cloud metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 0.0.0.0 or 255.255.255.255
    if (parts[0] === 0 || parts[0] === 255) return true;
    return false;
  }

  // IPv6 checks
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }

  return false;
}

async function validateUrl(urlString, allowedDomains = null) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch (err) {
    return { valid: false, error: "Invalid URL syntax" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, error: `Disallowed protocol: ${parsed.protocol}. Only http: and https: are allowed.` };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return { valid: false, error: "Localhost and internal hostnames are prohibited." };
  }

  if (allowedDomains && allowedDomains.length > 0) {
    const isAllowed = allowedDomains.some(domain => 
      hostname === domain.toLowerCase() || hostname.endsWith("." + domain.toLowerCase())
    );
    if (!isAllowed) {
      return { valid: false, error: `Domain ${hostname} is not in the allowed domain list.` };
    }
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (isPrivateIP(addr.address)) {
        return { valid: false, error: `Host resolves to prohibited private or loopback IP: ${addr.address}` };
      }
    }
  } catch (dnsErr) {
    return { valid: false, error: `DNS resolution failed: ${dnsErr.message}` };
  }

  return { valid: true, url: parsed.toString(), hostname };
}

async function safeFetch(urlString, options = {}) {
  const timeoutMs = options.timeoutMs || 8000;
  const maxBytes = options.maxBytes || 2 * 1024 * 1024; // 2MB max
  const allowedDomains = options.allowedDomains || null;

  const validation = await validateUrl(urlString, allowedDomains);
  if (!validation.valid) {
    throw new Error(`SSRF validation blocked request: ${validation.error}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(urlString, {
      method: "GET",
      headers: {
        "User-Agent": "OpportunityRadar/1.0 (+https://github.com/opportunity-radar; student-research-engine)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(options.headers || {})
      },
      signal: controller.signal,
      redirect: "follow"
    });

    clearTimeout(timer);

    // Validate redirected URL as well
    if (response.url && response.url !== urlString) {
      const redirectCheck = await validateUrl(response.url, allowedDomains);
      if (!redirectCheck.valid) {
        throw new Error(`SSRF redirect blocked: ${redirectCheck.error}`);
      }
    }

    const contentType = response.headers.get("content-type") || "";
    const contentLength = Number(response.headers.get("content-length") || 0);

    if (contentLength > maxBytes) {
      throw new Error(`Content length exceeds limit (${contentLength} > ${maxBytes} bytes)`);
    }

    const text = await response.text();
    if (text.length > maxBytes) {
      throw new Error(`Response body exceeds limit (${text.length} > ${maxBytes} bytes)`);
    }

    return {
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      contentType,
      text,
      url: response.url
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

module.exports = { isPrivateIP, validateUrl, safeFetch };
