/** Brand icons for the LoginModal provider buttons. Inline SVGs so we don't
 *  pull in another asset pipeline; sized via the `size` prop, default 18. */

export function MetaMaskIcon({ size = 18 }: { size?: number }) {
  // Stylised MetaMask fox head — close enough to the official mark to be
  // recognisable without redistributing the trademarked asset verbatim.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M28.5 2L17.6 10.1l2-4.7z" fill="#E2761B" />
      <path d="M3.5 2L14.3 10.2 12.4 5.4z" fill="#E4761B" />
      <path d="M24.4 21.6l-2.9 4.4 6.2 1.7 1.8-6z" fill="#E4761B" />
      <path d="M2.5 21.7l1.8 6 6.2-1.7-2.9-4.4z" fill="#E4761B" />
      <path d="M10.1 14.3l-1.7 2.6 6.1.3-.2-6.6z" fill="#E4761B" />
      <path d="M21.9 14.3L17.6 10.5l-.1 6.7 6.1-.3z" fill="#E4761B" />
      <path d="M10.5 26l3.7-1.8-3.2-2.5z" fill="#E4761B" />
      <path d="M17.8 24.2l3.7 1.8-.5-4.3z" fill="#E4761B" />
      <path d="M21.5 26l-3.7-1.8.3 2.4v1z" fill="#D7C1B3" />
      <path d="M10.5 26l3.4 1.6v-1l.3-2.4z" fill="#D7C1B3" />
      <path d="M14 20l-3.1-.9 2.2-1z" fill="#233447" />
      <path d="M18 20l.9-1.9 2.2 1z" fill="#233447" />
      <path d="M10.5 26l.5-4.4-3.4.1z" fill="#CD6116" />
      <path d="M21 21.6l.5 4.4 2.9-4.3z" fill="#CD6116" />
      <path d="M23.6 16.9l-6.1.3.6 3.1.9-1.9 2.2 1z" fill="#CD6116" />
      <path d="M10.9 19.4l2.2-1 .9 1.9.6-3.1-6.1-.3z" fill="#CD6116" />
      <path d="M8.4 16.9l2.5 5-.1-2.5z" fill="#E4751F" />
      <path d="M21.2 19.4l-.1 2.5 2.5-5z" fill="#E4751F" />
      <path d="M14.5 17.2l-.6 3.1.7 3.7.2-4.9z" fill="#E4751F" />
      <path d="M17.5 17.2l-.3 1.9.2 4.9.7-3.7z" fill="#E4751F" />
      <path d="M18.1 20.3l-.7 3.7.5.4 3.2-2.5.1-2.5z" fill="#F6851B" />
      <path d="M10.9 19.4l.1 2.5 3.2 2.5.5-.4-.7-3.7z" fill="#F6851B" />
      <path d="M18.2 27.6v-1l-.3-.2H14l-.2.2v1l-3.4-1.6 1.2 1 2.4 1.7h4.1l2.4-1.7 1.2-1z" fill="#C0AD9E" />
      <path d="M17.8 24.2l-.5-.4h-2.6l-.5.4-.3 2.4.2-.2h3.8l.2.2z" fill="#161616" />
      <path d="M28.9 10.6l.9-4.5-1.4-4.1L18 10.5l4 3.4 5.6 1.6 1.2-1.4-.5-.4 1-.9-.7-.5z" fill="#763D16" />
      <path d="M2.2 6.1l.9 4.5-.6.4-.7.5 1 .9-.5.4 1.2 1.4 5.6-1.6 4-3.4L3.6 2z" fill="#763D16" />
      <path d="M27.6 15.5L22 13.9l1.7 2.6-2.5 5 3.3 0h4.9z" fill="#F6851B" />
      <path d="M10.1 13.9l-5.6 1.6-1.8 5.6h4.9l3.3 0-2.5-5z" fill="#F6851B" />
      <path d="M17.6 17.2l.4-6.7L19.9 5.4h-7.8l1.9 5.1.5 6.7.2 2.1V24h2.7v-4.7z" fill="#F6851B" />
    </svg>
  );
}

export function XIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function TelegramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </svg>
  );
}

export function MailIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </svg>
  );
}
