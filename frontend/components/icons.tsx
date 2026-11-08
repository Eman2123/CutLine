import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

function Base({ children, ...p }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...p}
    >
      {children}
    </svg>
  );
}

export function LogoMark(p: P) {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" aria-hidden="true" {...p}>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="#0F172A" />
      <rect x="8" y="8" width="16" height="16" rx="4" stroke="#F8FAFC" strokeWidth="2" />
      <path d="M9 23L23 9" stroke="#F43F5E" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="3.2 3.2" />
    </svg>
  );
}

export const IconScissors = (p: P) => (
  <Base {...p}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M8.1 8.1L20 20" />
    <path d="M8.1 15.9L20 4" />
  </Base>
);

export const IconShield = (p: P) => (
  <Base {...p}>
    <path d="M12 3l8 3v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6l8-3z" />
    <path d="M9 12l2.2 2.2L15.5 10" />
  </Base>
);

export const IconShieldOff = (p: P) => (
  <Base {...p}>
    <path d="M12 3l8 3v6c0 1.6-.4 3-1.1 4.3" />
    <path d="M7.5 18.5C5.3 16.9 4 14.6 4 12V6l3-1.1" />
    <path d="M3 3l18 18" />
  </Base>
);

export const IconWallet = (p: P) => (
  <Base {...p}>
    <path d="M4 7a2 2 0 012-2h11v4" />
    <path d="M4 7v10a2 2 0 002 2h13a1 1 0 001-1v-9a1 1 0 00-1-1H6a2 2 0 01-2-2z" />
    <circle cx="16" cy="13.5" r="1.1" fill="currentColor" stroke="none" />
  </Base>
);

export const IconVault = (p: P) => (
  <Base {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 8.8V7M12 17v-1.8M8.8 12H7M17 12h-1.8" />
  </Base>
);

export const IconNetwork = (p: P) => (
  <Base {...p}>
    <rect x="9" y="3" width="6" height="5" rx="1.5" />
    <rect x="3" y="16" width="6" height="5" rx="1.5" />
    <rect x="15" y="16" width="6" height="5" rx="1.5" />
    <path d="M12 8v4M6 16v-4h12v4" />
  </Base>
);

export const IconTasks = (p: P) => (
  <Base {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8 9l1.6 1.6L12.5 8M8 15l1.6 1.6 2.9-2.6M15 9.5h2M15 15.5h2" />
  </Base>
);

export const IconHistory = (p: P) => (
  <Base {...p}>
    <path d="M4 12a8 8 0 108-8 8 8 0 00-5.7 2.4L4 8.5" />
    <path d="M4 4v4.5h4.5" />
    <path d="M12 8v4l3 2" />
  </Base>
);

export const IconCheck = (p: P) => (
  <Base {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Base>
);

export const IconX = (p: P) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Base>
);

export const IconAlert = (p: P) => (
  <Base {...p}>
    <path d="M12 4l9 16H3L12 4z" />
    <path d="M12 10v4M12 17.2v.1" />
  </Base>
);

export const IconClock = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Base>
);

export const IconExternal = (p: P) => (
  <Base {...p}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h4" />
  </Base>
);

export const IconRefresh = (p: P) => (
  <Base {...p}>
    <path d="M20 11a8 8 0 00-14.3-4.5L4 8.5M4 4v4.5h4.5" />
    <path d="M4 13a8 8 0 0014.3 4.5l1.7-2M20 20v-4.5h-4.5" />
  </Base>
);

export const IconKey = (p: P) => (
  <Base {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l8-8M16 7l2.5 2.5M13.5 9.5L16 12" />
  </Base>
);

export const IconSettings = (p: P) => (
  <Base {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Base>
);

export const IconBot = (p: P) => (
  <Base {...p}>
    <rect x="4" y="8" width="16" height="11" rx="3" />
    <path d="M12 4v4M9 13.5v.5M15 13.5v.5" />
    <path d="M2.5 13v2M21.5 13v2" />
  </Base>
);

export const IconArrowRight = (p: P) => (
  <Base {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Base>
);
