import { generateNonce } from "siwe";

/** SIWE nonce endpoint — frontend pulls a fresh string here, embeds it in
 *  the SIWE message it asks the wallet to sign, then sends both back to
 *  the credentials provider. We deliberately don't track the nonce
 *  server-side: the SIWE message itself includes domain + nonce + issuedAt
 *  and is single-use because Auth.js issues a new session per signature. */
export async function GET(): Promise<Response> {
  return new Response(generateNonce(), {
    headers: { "content-type": "text/plain", "cache-control": "no-store" },
  });
}
