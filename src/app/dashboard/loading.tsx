import { DashboardDocumentSkeletons } from "@/components/document-loading-skeletons";

export default function DashboardLoading() {
  return <main className="min-h-screen bg-[#f6f3ed] px-4 py-10 sm:px-8 md:px-10 lg:px-16"><div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3"><DashboardDocumentSkeletons /></div></main>;
}
