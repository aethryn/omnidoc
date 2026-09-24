import { NextRequest,NextResponse } from "next/server";
import { createAuthErrorResponse,getCurrentUserIdFromRequest } from "@/lib/auth";
import { isOperator } from "@/lib/operator";
import { wsControl } from "@/lib/ws-control";

async function authorize(request:NextRequest){const auth=await getCurrentUserIdFromRequest(request);return {auth,allowed:isOperator(auth.userId)};}

export async function GET(request:NextRequest){
  const {auth,allowed}=await authorize(request);if(!auth.userId)return createAuthErrorResponse(auth);if(!allowed)return NextResponse.json({error:"Not authorized"},{status:403});
  const response=await wsControl("/rooms").catch(()=>null);if(!response)return NextResponse.json({rooms:[],unavailable:true},{status:503});
  return new NextResponse(await response.text(),{status:response.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
}

export async function POST(request:NextRequest){
  const {auth,allowed}=await authorize(request);if(!auth.userId)return createAuthErrorResponse(auth);if(!allowed)return NextResponse.json({error:"Not authorized"},{status:403});
  const body=await request.json().catch(()=>({}));let path="";
  if(body.action==="revoke-session"&&typeof body.connectionId==="string")path=`/connections/${encodeURIComponent(body.connectionId)}/revoke`;
  if((body.action==="persist"||body.action==="drain")&&typeof body.documentId==="string")path=`/rooms/${encodeURIComponent(body.documentId)}/${body.action}`;
  if(!path)return NextResponse.json({error:"Invalid operation"},{status:400});
  const response=await wsControl(path,{method:"POST"}).catch(()=>null);if(!response)return NextResponse.json({error:"Collaboration service unavailable"},{status:503});
  return new NextResponse(await response.text(),{status:response.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
}
