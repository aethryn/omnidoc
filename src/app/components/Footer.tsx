import { useGSAP } from "@gsap/react";
import { GithubLogoIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRef } from "react";
import gsap from "gsap";
export default function Footer() {
    const footerRef = useRef<HTMLElement>(null);
  
    useGSAP(() => {
      if (!footerRef.current) return;
  
      gsap.from(footerRef.current, {
        y: 20,
        opacity: 0,
        duration: 0.6,
        delay: 2,
        ease: 'power3.out',
      });
    }, { scope: footerRef });
  
    return (
      <footer ref={footerRef} className="px-8 py-6 border-t border-gray-100">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-gray-500">
          <p>© Omnidoc.</p>
          <div className="flex gap-6">
            <Link className="flex items-center gap-2" href="https://github.com/utkarsh125/omnidocs">
            <GithubLogoIcon size={20} /> Github
            </Link> 
          </div>
        </div>
      </footer>
    );
  }
