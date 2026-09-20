import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr/ArrowUpRight";

import { OmnidocLogo } from "@/components/omnidoc-logo";
import { deriveDocumentPreview, documentReadingMinutes, documentToHtml } from "@/lib/document-content";
import { prisma } from "@/lib/prisma";
import { publicationUrl } from "@/lib/publication";
import "./public-document.css";

const getPublication = cache(async (id: string) => prisma.documentPublication.findFirst({
  where: { id, isActive: true },
  select: { id: true, slug: true, title: true, content: true, excerpt: true, publishedAt: true, updatedAt: true, document: { select: { user: { select: { name: true, avatar: true } } } } },
}));

type Props = { params: Promise<{ publicationId: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { publicationId } = await params;
  const publication = await getPublication(publicationId);
  if (!publication) return { title: "Document not found · Omnidoc", robots: { index: false, follow: false } };
  const canonical = publicationUrl(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000", publication.id, publication.title);
  return {
    title: `${publication.title} · Omnidoc`,
    description: publication.excerpt || "A document published with Omnidoc.",
    alternates: { canonical },
    robots: { index: false, follow: false },
    openGraph: { title: publication.title, description: publication.excerpt || "A document published with Omnidoc.", type: "article", url: canonical },
  };
}

export default async function PublicDocumentPage({ params }: Props) {
  const { publicationId, slug } = await params;
  const publication = await getPublication(publicationId);
  if (!publication) notFound();
  if (slug !== publication.slug) permanentRedirect(`/p/${publication.id}/${publication.slug}`);
  const preview = deriveDocumentPreview(publication.content);
  const author = publication.document.user;

  return <main className="public-document-page">
    <header className="public-document-nav">
      <Link href="/" aria-label="Omnidoc home"><OmnidocLogo priority className="public-document-logo" /><span>Omnidoc</span></Link>
      <Link href="/start" prefetch={false}>Start writing <ArrowUpRightIcon /></Link>
    </header>
    <article className="public-document-paper">
      <div className="public-document-heading">
        <span>Published document</span>
        <h1>{publication.title}</h1>
        <div className="public-document-byline">
          <span className="public-document-avatar">{author.avatar?.startsWith("http") ? <img src={author.avatar} alt="" /> : author.name.slice(0, 2).toUpperCase()}</span>
          <p><strong>{author.name}</strong><small>{new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(publication.publishedAt)} · {documentReadingMinutes(preview.wordCount)} min read</small></p>
        </div>
      </div>
      <div className="public-document-content" dangerouslySetInnerHTML={{ __html: documentToHtml(publication.content) }} />
    </article>
    <footer className="public-document-footer"><OmnidocLogo /><span>Made for thoughtful work.</span><Link href="/start" prefetch={false}>Create a document <ArrowUpRightIcon /></Link></footer>
  </main>;
}
