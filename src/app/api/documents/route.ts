import { NextRequest, NextResponse } from "next/server";

import { activeCollaboratorConstraint, documentAccessWhere, getCurrentUserIdFromRequest, createAuthErrorResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deriveDocumentPreview } from "@/lib/document-content";
import { enforceRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

export async function GET(request: NextRequest){
    try {
        
        const authResult = await getCurrentUserIdFromRequest(request);
        
        if (!authResult.userId) {
            return createAuthErrorResponse(authResult);
        }
        
        const userId = authResult.userId;
        const cursor=request.nextUrl.searchParams.get("cursor");
        const query=request.nextUrl.searchParams.get("q")?.trim().slice(0,100);
        const filter=request.nextUrl.searchParams.get("filter")||"all";
        const documents = await prisma.document.findMany({
            where: {AND:[documentAccessWhere(userId),query?{OR:[{title:{contains:query,mode:"insensitive"}},{previewText:{contains:query,mode:"insensitive"}}]}:{},filter==="draft"?{status:"WORKING_DRAFT"}:filter==="complete"?{status:"COMPLETE"}:filter==="published"?{publication:{is:{isActive:true}}}:filter==="shared"?{userId:{not:userId}}:{}]},
            orderBy: [{lastEditedAt:"desc"},{id:"desc"}],
            take:31,
            ...(cursor?{cursor:{id:cursor},skip:1}:{}),
            select: {
                id: true,
                title: true,
                updatedAt: true,
                lastEditedAt: true,
                userId: true,
                status: true,
                previewText: true,
                previewImageUrl: true,
                wordCount: true,
                publication: { select: { id: true, slug: true, isActive: true, publishedAt: true, updatedAt: true } },
                collaborators: { where: activeCollaboratorConstraint(), select: { id: true, role: true, user: { select: { id: true, name: true, avatar: true } } } }
            }
        });

        const hasMore=documents.length>30;const items=documents.slice(0,30).map((document)=>({...document,owned:document.userId===userId}));
        return NextResponse.json({items,nextCursor:hasMore?items.at(-1)?.id||null:null});
    } catch (error) {
        console.error("Error fetching documents: ", error);
        return NextResponse.json({
            message: "Error fetching documents",
        }, {status: 500});
    }
}

//Create a new document
//TODO: Document locking
export async function POST(request: NextRequest){

    try {
        
        const authResult = await getCurrentUserIdFromRequest(request);
        
        if (!authResult.userId) {
            return createAuthErrorResponse(authResult);
        }
        
        const userId = authResult.userId;
        const rate = await enforceRateLimit("document-create", userId, 30, 60 * 60_000);
        if (!rate.allowed) return rateLimitedResponse(rate.retryAfter, "Too many documents created. Try again later.");

        const { title = "Untitled", content = JSON.stringify({type:"doc",content:[{type:"paragraph"}]}), tags = [] } = await request.json();
        const preview = deriveDocumentPreview(content);

        const document = await prisma.document.create({
            data: {
                title,
                content,
                userId,
                tags,
                ...preview,
            },
            select: { id: true, title: true, status: true, updatedAt: true, lastEditedAt: true, yjsState:true, yjsEpoch:true }
        });

        return NextResponse.json({...document,yjsState:document.yjsState?Buffer.from(document.yjsState).toString("base64"):null});
    } catch (error) {
        console.error("Error creating document: ", error);
        return NextResponse.json({
            error: "Failed to create document",
        }, {status: 500});
    }
}
