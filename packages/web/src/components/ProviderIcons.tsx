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

export function GithubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.38-3.88-1.38-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.94 10.94 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.05.78 2.13v3.16c0 .31.21.67.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export function DiscordIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.099.246.197.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.974 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export function PasskeyIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="9" r="4" />
      <path d="M9 13c-3.5 0-6 2-6 5h7" />
      <path d="m17 11 4 4" />
      <path d="m21 11-4 4" />
      <path d="M14 14h7" />
      <path d="M19 14v4" />
    </svg>
  );
}
