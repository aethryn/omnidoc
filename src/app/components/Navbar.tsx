"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { FileTextIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";

gsap.registerPlugin(useGSAP);

export default function Navbar() {
  const navRef = useRef<HTMLElement>(null);
  const router = useRouter();

  useGSAP(
    () => {
      if (!navRef.current) return;

      gsap.from(navRef.current.children, {
        y: -20,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: "power3.out",
        delay: 0.2,
      });
    },
    { scope: navRef }
  );

  return (
    <nav ref={navRef} className="flex items-center justify-between px-8 py-6">
      <div className="flex items-center gap-2">
        
        <span className="text-2xl flex text-[rgb(84, 84, 84)]">
            Omnidoc<span className="text-blue-600">.</span>
        </span>
      </div>

      <button onClick={() => router.push('/start')} className="px-6 py-2.5 border border-gray-900 rounded-lg text-gray-900 font-medium hover:bg-gray-900 hover:text-white transition-colors">
        Start Now
      </button>
    </nav>
  );
}
