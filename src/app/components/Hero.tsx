import { useGSAP } from "@gsap/react";
import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { useRef, useEffect } from "react";
import gsap from "gsap";
import { useRouter } from "next/navigation";

export default function Hero() {
    const heroRef = useRef<HTMLElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const bentoRef = useRef<HTMLDivElement>(null);

    const router = useRouter();
  
    // Ensure video autoplay works
    useEffect(() => {
      if (videoRef.current) {
        videoRef.current.play().catch(error => {
          console.log("Video autoplay failed:", error);
        });
      }
    }, []);

    useGSAP(() => {
      if (!heroRef.current) return;
  
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  
      // Animate title
      tl.from(titleRef.current, {
        y: 50,
        opacity: 0,
        duration: 1,
        delay: 0.5,
      });
  
      // Animate CTA section
      tl.from('.cta-section', {
        y: 30,
        opacity: 0,
        duration: 0.8,
      }, '-=0.6');

      // Animate video
      tl.from('.video-block', {
        y: 40,
        opacity: 0,
        duration: 0.8,
      }, '-=0.5');

      // Animate bento cards
      tl.from('.bento-card', {
        y: 40,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
      }, '-=0.4');
    }, { scope: heroRef });
  
    return (
      <section ref={heroRef} className="flex-1 px-4 sm:px-6 md:px-8 py-8 md:py-12 flex max-w-7xl mx-auto flex-col justify-center">
        <div className="max-w-7xl mx-auto w-full space-y-8 md:space-y-12 py-4 md:py-8">
          {/* Hero Header */}
          <div className="text-center space-y-4 md:space-y-6">
            <h1
              ref={titleRef}
              className="text-4xl sm:text-5xl md:text-6xl font-medium text-gray-900 leading-tight px-4"
            >
              Document editing made simple
            </h1>

            <div className="cta-section flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4 px-4">
              <button 
                onClick={() => router.push('/signin')} 
                className="group px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-medium transition-all flex items-center gap-2 w-full sm:w-auto justify-center"
              >
                Get Started
                <ArrowUpRightIcon size={20} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </button>
              <p className="text-gray-600 text-sm md:text-base">
                Create, edit, and collaborate in real-time
              </p>
            </div>
          </div>
  
          {/* Full Width Video Block - Centered and Responsive */}
          <div className="video-block w-full max-w-6xl mx-auto rounded-3xl overflow-hidden shadow-2xl bg-gray-50">
            <video
              ref={videoRef}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              className="w-full h-auto rounded-3xl"
            >
              <source src="/videos/omnidocs.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>

          {/* Bento Grid - Cards Below Video */}
          <div ref={bentoRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            
            {/* Real-time Collaboration Card */}
            <div className="bento-card col-span-1 sm:col-span-2 lg:col-span-2 bg-gray-50 border-1  rounded-2xl md:rounded-3xl p-6 md:p-8 flex flex-col justify-between hover:bg-gray-100 transition-colors min-h-[200px] md:min-h-[240px]">
              <div>
                <h3 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-2 md:mb-3">
                  Real-time collaboration
                </h3>
                <p className="text-gray-600  text-base md:text-lg">
                  Work together seamlessly with your team. See changes instantly as they happen.
                </p>
              </div>
              <div className="flex -space-x-3 mt-4 md:mt-6">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-blue-400 border-2 md:border-3 border-white"></div>
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-purple-400 border-2 md:border-3 border-white"></div>
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-pink-400 border-2 md:border-3 border-white"></div>
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-indigo-400 border-2 md:border-3 border-white"></div>
              </div>
            </div>

            {/* Export Options Card */}
            <div className="bento-card col-span-1 border-1  bg-gray-50 rounded-2xl md:rounded-3xl p-6 md:p-8 flex flex-col justify-between hover:bg-gray-100 transition-colors min-h-[200px] md:min-h-[240px]">
              <div>
                <h3 className="text-xl md:text-2xl font-semibold text-gray-900 mb-2">
                  Export to multiple formats
                </h3>
                <p className="text-gray-600 text-sm md:text-base">
                  PDF and HTML exports
                </p>
              </div>
            </div>

            {/* Lightning Fast Card */}
            <div className="bento-card col-span-1 border-1  bg-gray-50 rounded-2xl md:rounded-3xl p-6 md:p-8 hover:bg-gray-100 transition-colors min-h-[160px] md:min-h-[180px]">
              <h3 className="text-xl md:text-2xl font-semibold text-gray-900 mb-2">
                Lightning fast
              </h3>
              <p className="text-gray-600 text-sm md:text-base">
                Fast by design
              </p>
            </div>

            {/* Beautiful Results Card */}
            <div className="bento-card col-span-1 border-1  bg-gray-50 rounded-2xl md:rounded-3xl p-6 md:p-8 hover:bg-gray-100 transition-colors min-h-[160px] md:min-h-[180px]">
              <h3 className="text-xl md:text-2xl font-semibold text-gray-900 mb-2">
                Beautiful results
              </h3>
              <p className="text-gray-600 text-sm md:text-base">
                Make beautiful documents
              </p>
            </div>

            {/* Easy to Use Card */}
            <div className="bento-card col-span-1 border-1  bg-gray-50 rounded-2xl md:rounded-3xl p-6 md:p-8 hover:bg-gray-100 transition-colors min-h-[160px] md:min-h-[180px]">
              <h3 className="text-xl md:text-2xl font-semibold text-gray-900 mb-2">
                Remarkably easy to use
              </h3>
              <p className="text-gray-600 text-sm md:text-base">
                No learning curve
              </p>
            </div>
          </div>
        </div>
      </section>
    );
}
