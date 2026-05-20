export default function HeroIllustration() {
  return (
    <div className="relative w-full select-none" style={{ maxWidth: 720 }}>
      <style>{`
        @keyframes scanMove {
          0%   { transform: translateY(0);    opacity: 0.6; }
          80%  { opacity: 0.6; }
          100% { transform: translateY(238px); opacity: 0; }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.55; }
          50%       { opacity: 1; }
        }
        @keyframes floatUp {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-8px); }
        }
        @keyframes floatUp2 {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-6px); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes particleDrift {
          0%   { transform: translate(0,0);      opacity: 0.7; }
          50%  { transform: translate(4px,-8px); opacity: 1; }
          100% { transform: translate(0,0);      opacity: 0.7; }
        }
        .scan-line   { animation: scanMove   2.8s linear infinite; }
        .glow-pulse  { animation: glowPulse  2.2s ease-in-out infinite; }
        .float-1     { animation: floatUp    3.5s ease-in-out infinite; }
        .float-2     { animation: floatUp2   4s   ease-in-out infinite 0.7s; }
        .blink-dot   { animation: blink      1.4s ease-in-out infinite; }
        .particle-1  { animation: particleDrift 3s ease-in-out infinite; }
        .particle-2  { animation: particleDrift 3.5s ease-in-out infinite 0.8s; }
        .particle-3  { animation: particleDrift 2.8s ease-in-out infinite 1.5s; }
        .particle-4  { animation: particleDrift 4s   ease-in-out infinite 0.3s; }
      `}</style>

      <svg viewBox="0 0 580 500" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
        <defs>
          {/* Glow filters */}
          <filter id="glow-gold" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glow-wide" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="10" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glow-sm" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>

          {/* Gradients */}
          <radialGradient id="bgGrad" cx="50%" cy="38%" r="65%">
            <stop offset="0%"   stopColor="#1a3828"/>
            <stop offset="100%" stopColor="#080f0a"/>
          </radialGradient>
          <linearGradient id="backWallGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#1B3A2D" stopOpacity="0.55"/>
            <stop offset="100%" stopColor="#0d2018" stopOpacity="0.8"/>
          </linearGradient>
          <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#162d20" stopOpacity="0.7"/>
            <stop offset="100%" stopColor="#0a1812" stopOpacity="0.95"/>
          </linearGradient>
          <linearGradient id="leftWallGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#07110c" stopOpacity="1"/>
            <stop offset="100%" stopColor="#162d20" stopOpacity="0.6"/>
          </linearGradient>
          <linearGradient id="ceilGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#1B3A2D" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="#0d2018" stopOpacity="0.5"/>
          </linearGradient>
          <linearGradient id="tabletGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#0d2018"/>
            <stop offset="100%" stopColor="#050d08"/>
          </linearGradient>
          <linearGradient id="screenGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="#0a1f14"/>
            <stop offset="100%" stopColor="#05100a"/>
          </linearGradient>
          <linearGradient id="beamGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#C9A84C" stopOpacity="0.18"/>
            <stop offset="100%" stopColor="#C9A84C" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id="personBodyGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="#2D5A43"/>
            <stop offset="100%" stopColor="#1B3A2D"/>
          </linearGradient>

          {/* Clip for the holographic display interior */}
          <clipPath id="displayClip">
            <rect x="103" y="43" width="354" height="234"/>
          </clipPath>
        </defs>

        {/* ─── Background ─────────────────────────────────────────── */}
        <rect width="580" height="500" fill="url(#bgGrad)"/>

        {/* Dot grid */}
        {Array.from({length: 13}).map((_, r) =>
          Array.from({length: 16}).map((_, c) => (
            <circle key={`d${r}-${c}`} cx={c*38+10} cy={r*38+10} r="0.7"
              fill="rgba(45,90,67,0.28)"/>
          ))
        )}

        {/* Ambient glow behind display */}
        <ellipse cx="280" cy="165" rx="190" ry="120"
          fill="rgba(201,168,76,0.04)" filter="url(#glow-wide)" className="glow-pulse"/>

        {/* ─── Holographic display frame ──────────────────────────── */}
        {/* Outer halo */}
        <rect x="96" y="36" width="368" height="248" rx="5"
          fill="none" stroke="rgba(201,168,76,0.18)" strokeWidth="10"
          filter="url(#glow-wide)" className="glow-pulse"/>

        {/* Gold border */}
        <rect x="102" y="42" width="356" height="236" rx="3"
          fill="none" stroke="#C9A84C" strokeWidth="1.5"
          filter="url(#glow-gold)" className="glow-pulse"/>

        {/* Corner brackets */}
        {[
          [102, 42,  1,  1],
          [458, 42, -1,  1],
          [102, 278, 1, -1],
          [458, 278,-1, -1],
        ].map(([x, y, sx, sy], i) => (
          <g key={i} filter="url(#glow-gold)">
            <line x1={x} y1={y} x2={x + sx*22} y2={y}      stroke="#C9A84C" strokeWidth="3"/>
            <line x1={x} y1={y} x2={x}          y2={y + sy*22} stroke="#C9A84C" strokeWidth="3"/>
          </g>
        ))}

        {/* ─── Room interior (1-point perspective, VP≈280,160) ────── */}
        {/* Back wall */}
        <polygon points="185,100 375,100 375,225 185,225"
          fill="url(#backWallGrad)"/>
        {/* Ceiling */}
        <polygon points="103,43 457,43 375,100 185,100"
          fill="url(#ceilGrad)"/>
        {/* Left wall */}
        <polygon points="103,43 185,100 185,225 103,277"
          fill="url(#leftWallGrad)"/>
        {/* Right wall */}
        <polygon points="457,43 375,100 375,225 457,277"
          fill="rgba(8,18,12,0.92)"/>
        {/* Floor */}
        <polygon points="103,277 457,277 375,225 185,225"
          fill="url(#floorGrad)"/>

        {/* Perspective grid on floor */}
        {[180, 220, 260, 300, 340, 380, 420].map(x => (
          <line key={`fl${x}`}
            x1={x} y1="277" x2="280" y2="160"
            stroke="rgba(201,168,76,0.06)" strokeWidth="0.6" strokeDasharray="3 6"/>
        ))}
        {[0.15, 0.35, 0.6, 0.82].map((t, i) => {
          const y  = 225 + (277-225)*t;
          const x1 = 185 + (103-185)*t;
          const x2 = 375 + (457-375)*t;
          return <line key={`fh${i}`} x1={x1} y1={y} x2={x2} y2={y}
            stroke="rgba(201,168,76,0.06)" strokeWidth="0.6"/>;
        })}

        {/* Perspective grid on back wall */}
        {[215, 245, 275, 305, 345].map(x => (
          <line key={`bv${x}`} x1={x} y1="100" x2={x} y2="225"
            stroke="rgba(201,168,76,0.05)" strokeWidth="0.5"/>
        ))}
        {[130, 155, 180, 210].map(y => (
          <line key={`bh${y}`} x1="185" y1={y} x2="375" y2={y}
            stroke="rgba(201,168,76,0.05)" strokeWidth="0.5"/>
        ))}

        {/* ─── Furniture wireframes ────────────────────────────────── */}
        {/* Wardrobe — left area, against back-left */}
        <g filter="url(#glow-sm)">
          {/* Front face */}
          <rect x="190" y="130" width="55" height="92"
            fill="rgba(201,168,76,0.06)" stroke="#C9A84C" strokeWidth="0.9"/>
          {/* Right face (depth) */}
          <polygon points="245,130 265,115 265,207 245,222"
            fill="rgba(201,168,76,0.04)" stroke="#C9A84C" strokeWidth="0.7" strokeOpacity="0.5"/>
          {/* Top face */}
          <polygon points="190,130 245,130 265,115 210,115"
            fill="rgba(201,168,76,0.08)" stroke="#C9A84C" strokeWidth="0.7" strokeOpacity="0.5"/>
          {/* Door divider */}
          <line x1="217" y1="130" x2="217" y2="222" stroke="#C9A84C" strokeWidth="0.5" strokeOpacity="0.6"/>
          {/* Handles */}
          <circle cx="213" cy="178" r="2.5" fill="#C9A84C" opacity="0.7"/>
          <circle cx="221" cy="178" r="2.5" fill="#C9A84C" opacity="0.7"/>
        </g>

        {/* TV Unit — right side, against back wall */}
        <g filter="url(#glow-sm)">
          {/* Unit body */}
          <rect x="295" y="192" width="72" height="30"
            fill="rgba(201,168,76,0.05)" stroke="#C9A84C" strokeWidth="0.8"/>
          {/* Top face */}
          <polygon points="295,192 367,192 377,183 305,183"
            fill="rgba(201,168,76,0.07)" stroke="#C9A84C" strokeWidth="0.6" strokeOpacity="0.5"/>
          {/* Right face */}
          <polygon points="367,192 377,183 377,213 367,222"
            fill="rgba(201,168,76,0.04)" stroke="#C9A84C" strokeWidth="0.6" strokeOpacity="0.4"/>
          {/* TV screen above unit */}
          <rect x="305" y="150" width="52" height="36"
            fill="rgba(27,58,45,0.5)" stroke="#C9A84C" strokeWidth="0.8"/>
          {/* TV screen glow */}
          <rect x="307" y="152" width="48" height="32" rx="1"
            fill="rgba(45,90,67,0.6)"/>
          {/* Screen content lines */}
          <line x1="310" y1="162" x2="352" y2="162" stroke="rgba(201,168,76,0.4)" strokeWidth="1"/>
          <line x1="310" y1="168" x2="340" y2="168" stroke="rgba(201,168,76,0.25)" strokeWidth="0.8"/>
          <line x1="310" y1="174" x2="348" y2="174" stroke="rgba(201,168,76,0.2)" strokeWidth="0.8"/>
          {/* TV stand */}
          <line x1="331" y1="186" x2="331" y2="192" stroke="#C9A84C" strokeWidth="1.5" strokeOpacity="0.6"/>
        </g>

        {/* Bed — center-floor area */}
        <g filter="url(#glow-sm)">
          {/* Bed base */}
          <polygon points="200,240 280,240 295,230 215,230"
            fill="rgba(201,168,76,0.07)" stroke="#C9A84C" strokeWidth="0.7"/>
          {/* Headboard */}
          <polygon points="200,240 215,230 215,210 200,220"
            fill="rgba(201,168,76,0.08)" stroke="#C9A84C" strokeWidth="0.7"/>
          {/* Mattress top */}
          <polygon points="200,240 280,240 295,230 215,230"
            fill="rgba(201,168,76,0.04)"/>
          {/* Pillow */}
          <polygon points="204,236 218,236 222,226 208,226"
            fill="rgba(245,240,232,0.1)" stroke="rgba(201,168,76,0.4)" strokeWidth="0.5"/>
        </g>

        {/* ─── Scan line (animated) ─────────────────────────────────── */}
        <g clipPath="url(#displayClip)">
          <rect x="103" y="43" width="354" height="4"
            fill="rgba(201,168,76,0.15)" className="scan-line"
            style={{ filter: "blur(1px)" }}/>
        </g>

        {/* ─── AI "Generating" label top-right of display ────────────── */}
        <g filter="url(#glow-sm)" className="glow-pulse">
          <rect x="374" y="48" width="80" height="18" rx="2"
            fill="rgba(201,168,76,0.15)" stroke="rgba(201,168,76,0.5)" strokeWidth="0.8"/>
          <circle cx="384" cy="57" r="3.5" fill="#C9A84C" className="blink-dot"/>
          <text x="392" y="61" fill="#C9A84C" fontSize="7.5"
            fontFamily="DM Sans, sans-serif" fontWeight="600">Generating…</text>
        </g>

        {/* Display info label top-left */}
        <rect x="108" y="48" width="100" height="14" rx="2"
          fill="rgba(0,0,0,0.35)"/>
        <text x="113" y="58" fill="rgba(245,240,232,0.55)"
          fontSize="6.5" fontFamily="DM Sans, sans-serif">Bedroom · 3200 × 2800mm</text>

        {/* ─── Projection beams from tablet to display ─────────────── */}
        <polygon points="240,340 240,278 280,278 280,340" fill="url(#beamGrad)" opacity="0.5"/>
        <polygon points="316,340 316,278 356,278 356,340" fill="url(#beamGrad)" opacity="0.5"/>

        {/* ─── Carpenter figure ────────────────────────────────────── */}
        {/* Standing to the right-bottom, operating the tablet */}

        {/* Body/torso */}
        <rect x="440" y="340" width="36" height="50" rx="4"
          fill="url(#personBodyGrad)" stroke="rgba(45,90,67,0.5)" strokeWidth="0.8"/>

        {/* Head */}
        <circle cx="458" cy="326" r="16"
          fill="#2D5A43" stroke="rgba(45,90,67,0.6)" strokeWidth="0.8"/>
        {/* Face highlight */}
        <circle cx="454" cy="322" r="5" fill="rgba(245,240,232,0.08)"/>

        {/* Hard hat */}
        <ellipse cx="458" cy="314" rx="19" ry="7"
          fill="#C9A84C" opacity="0.85"/>
        <rect x="441" y="311" width="34" height="6" rx="1"
          fill="#C9A84C" opacity="0.85"/>
        <rect x="439" y="315" width="38" height="3" rx="1"
          fill="rgba(201,168,76,0.5)"/>

        {/* Left arm — extended toward tablet */}
        <path d="M440,352 Q400,360 360,370"
          stroke="#2D5A43" strokeWidth="14" strokeLinecap="round" fill="none"/>
        <path d="M440,352 Q400,360 360,370"
          stroke="rgba(45,90,67,0.7)" strokeWidth="14" strokeLinecap="round" fill="none"/>

        {/* Right arm down */}
        <rect x="474" y="355" width="14" height="30" rx="4"
          fill="#2D5A43"/>

        {/* Legs */}
        <rect x="442" y="388" width="14" height="35" rx="4"
          fill="#1B3A2D"/>
        <rect x="460" y="388" width="14" height="35" rx="4"
          fill="#1B3A2D"/>

        {/* Work apron detail */}
        <rect x="447" y="352" width="22" height="30" rx="2"
          fill="rgba(201,168,76,0.15)" stroke="rgba(201,168,76,0.3)" strokeWidth="0.6"/>

        {/* ─── Tablet device (hand-held) ───────────────────────────── */}
        <g transform="rotate(-8, 300, 380)">
          {/* Tablet body */}
          <rect x="240" y="335" width="120" height="78" rx="6"
            fill="url(#tabletGrad)" stroke="#2D5A43" strokeWidth="2"/>
          {/* Screen */}
          <rect x="245" y="340" width="110" height="68" rx="3"
            fill="url(#screenGrad)"/>

          {/* App UI on screen */}
          {/* Top bar */}
          <rect x="245" y="340" width="110" height="16" rx="3"
            fill="rgba(27,58,45,0.9)"/>
          <text x="250" y="351" fill="rgba(201,168,76,0.8)"
            fontSize="7" fontFamily="DM Sans, sans-serif" fontWeight="700">CarpentrIQ</text>
          <circle cx="347" cy="348" r="3" fill="#C9A84C" opacity="0.7" className="blink-dot"/>

          {/* Room mini-preview on screen */}
          <rect x="247" y="358" width="70" height="42" rx="1"
            fill="rgba(15,36,25,0.9)"/>
          {/* Mini room lines */}
          <polygon points="247,399 317,399 310,380 254,380" fill="rgba(27,58,45,0.7)"/>
          <polygon points="247,358 317,358 310,372 254,372" fill="rgba(27,58,45,0.5)"/>
          <rect x="254" y="372" width="56" height="8" fill="rgba(27,58,45,0.8)"/>
          {/* Mini wardrobe */}
          <rect x="256" y="374" width="12" height="22"
            fill="none" stroke="rgba(201,168,76,0.7)" strokeWidth="0.6"/>
          {/* Mini TV unit */}
          <rect x="285" y="390" width="20" height="7"
            fill="none" stroke="rgba(201,168,76,0.7)" strokeWidth="0.6"/>
          {/* Sparkle on screen */}
          <text x="295" y="370" fill="#C9A84C" fontSize="6" opacity="0.7">✦</text>

          {/* Quote sidebar on screen */}
          <rect x="319" y="358" width="34" height="42" rx="1"
            fill="rgba(10,25,16,0.9)"/>
          <rect x="322" y="362" width="20" height="2" rx="1" fill="rgba(245,240,232,0.3)"/>
          <rect x="322" y="367" width="26" height="2" rx="1" fill="rgba(245,240,232,0.2)"/>
          <rect x="322" y="372" width="18" height="2" rx="1" fill="rgba(245,240,232,0.2)"/>
          <line x1="319" y1="380" x2="353" y2="380"
            stroke="rgba(201,168,76,0.25)" strokeWidth="0.5"/>
          <text x="321" y="392" fill="#C9A84C"
            fontSize="7" fontFamily="DM Serif Display, serif">₹46K</text>

          {/* Home indicator */}
          <rect x="287" y="411" width="26" height="2" rx="1"
            fill="rgba(245,240,232,0.2)"/>
        </g>

        {/* ─── Floating badges ─────────────────────────────────────── */}

        {/* Badge 1 — client approved (top-left, floating) */}
        <g className="float-1" style={{ transformOrigin: "65px 90px" }}>
          <rect x="20" y="70" width="130" height="40" rx="4"
            fill="rgba(5,12,8,0.92)" stroke="rgba(34,197,94,0.4)" strokeWidth="1"
            style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}/>
          <circle cx="36" cy="90" r="9" fill="rgba(34,197,94,0.15)"/>
          <path d="M31,90 L35,94 L42,85" stroke="#22C55E" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <text x="50" y="87" fill="rgba(245,240,232,0.9)"
            fontSize="8" fontFamily="DM Sans, sans-serif" fontWeight="600">Client approved</text>
          <text x="50" y="98" fill="rgba(245,240,232,0.35)"
            fontSize="7" fontFamily="DM Sans, sans-serif">Quote #QT-2024-089</text>
        </g>

        {/* Badge 2 — dimensions (left-mid, floating) */}
        <g className="float-2" style={{ transformOrigin: "52px 200px" }}>
          <rect x="16" y="180" width="118" height="36" rx="4"
            fill="rgba(5,12,8,0.92)" stroke="rgba(201,168,76,0.35)" strokeWidth="1"/>
          <rect x="22" y="186" width="8" height="24" rx="1"
            fill="rgba(201,168,76,0.2)"/>
          <line x1="26" y1="186" x2="26" y2="210" stroke="#C9A84C" strokeWidth="1" strokeDasharray="2 2"/>
          <text x="36" y="197" fill="rgba(245,240,232,0.5)"
            fontSize="6.5" fontFamily="DM Sans, sans-serif">Room detected</text>
          <text x="36" y="208" fill="#C9A84C"
            fontSize="8.5" fontFamily="JetBrains Mono, monospace" fontWeight="700">3200×2800mm</text>
        </g>

        {/* Badge 3 — total amount (top-right, floating) */}
        <g className="float-1" style={{ transformOrigin: "520px 105px", animationDelay: "1s" }}>
          <rect x="440" y="85" width="120" height="40" rx="4"
            fill="rgba(5,12,8,0.92)" stroke="rgba(201,168,76,0.35)" strokeWidth="1"/>
          <text x="450" y="100" fill="rgba(245,240,232,0.4)"
            fontSize="7" fontFamily="DM Sans, sans-serif">Quote total</text>
          <text x="450" y="115" fill="#C9A84C"
            fontSize="15" fontFamily="DM Serif Display, serif">₹63,300</text>
        </g>

        {/* Badge 4 — WhatsApp sent (bottom-right, floating) */}
        <g className="float-2" style={{ transformOrigin: "510px 305px" }}>
          <rect x="434" y="285" width="122" height="38" rx="4"
            fill="rgba(5,12,8,0.92)" stroke="rgba(37,211,102,0.35)" strokeWidth="1"/>
          <rect x="440" y="292" width="18" height="18" rx="9"
            fill="#25D366"/>
          <text x="444" y="305" fill="#fff"
            fontSize="9" fontFamily="sans-serif">✉</text>
          <text x="465" y="300" fill="rgba(245,240,232,0.85)"
            fontSize="7.5" fontFamily="DM Sans, sans-serif" fontWeight="600">Sent on WhatsApp</text>
          <text x="465" y="311" fill="rgba(245,240,232,0.3)"
            fontSize="6.5" fontFamily="DM Sans, sans-serif">2 min ago</text>
        </g>

        {/* ─── Particles / sparkles ─────────────────────────────────── */}
        <g filter="url(#glow-sm)">
          <circle cx="92"  cy="148" r="2.5" fill="#C9A84C" className="particle-1"/>
          <circle cx="478" cy="210" r="2"   fill="#C9A84C" className="particle-2"/>
          <circle cx="160" cy="310" r="1.8" fill="#C9A84C" className="particle-3"/>
          <circle cx="490" cy="155" r="1.5" fill="#2D5A43" className="particle-4"/>
          <circle cx="115" cy="390" r="2"   fill="#C9A84C" className="particle-1" style={{ animationDelay:"1.2s" }}/>
          <circle cx="510" cy="380" r="1.5" fill="#C9A84C" className="particle-3" style={{ animationDelay:"0.6s" }}/>

          {/* Star sparkles */}
          <text x="86"  y="50"  fill="#C9A84C" fontSize="10" opacity="0.5" className="particle-2">✦</text>
          <text x="485" y="60"  fill="#C9A84C" fontSize="8"  opacity="0.4" className="particle-1">✦</text>
          <text x="60"  y="280" fill="#C9A84C" fontSize="7"  opacity="0.35" className="particle-3">✦</text>
          <text x="500" y="440" fill="#C9A84C" fontSize="9"  opacity="0.3" className="particle-4">✦</text>
        </g>

        {/* ─── Floor ground shadow under carpenter ─────────────────── */}
        <ellipse cx="455" cy="425" rx="45" ry="8"
          fill="rgba(0,0,0,0.35)"/>

        {/* ─── "AI" chip on display — floating small label ───────── */}
        <g filter="url(#glow-sm)" className="glow-pulse">
          <rect x="108" y="260" width="55" height="14" rx="2"
            fill="rgba(201,168,76,0.1)" stroke="rgba(201,168,76,0.4)" strokeWidth="0.6"/>
          <text x="116" y="270" fill="#C9A84C"
            fontSize="7" fontFamily="DM Sans, sans-serif">✦ DALL-E 3</text>
        </g>

      </svg>
    </div>
  );
}
