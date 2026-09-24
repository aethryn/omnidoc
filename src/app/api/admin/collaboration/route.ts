import { NextRequest,NextResponse } from "next/server";
import { createAuthErrorResponse,getCurrentUserIdFromRequest } from "@/lib/auth";
import { isOperator } from "@/lib/operator";
import { wsControl } from "@/lib/ws-control";

type SafeRoom={documentId:string;ownerId:string;connections:unknown[]};

async function authorize(request:NextRequest){const auth=await getCurrentUserIdFromRequest(request);return {auth,allowed:isOperator(auth.userId)};}

export async function GET(request:NextRequest){
  const {auth,allowed}=await authorize(request);if(!auth.userId)return createAuthErrorResponse(auth);if(!allowed)return NextResponse.json({error:"Not authorized"},{status:403});
  const response=await wsControl("/rooms").catch(()=>null);if(!response)return NextResponse.json({rooms:[],unavailable:true},{status:503});
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload||!Array.isArray(payload.rooms))return NextResponse.json({error:"Collaboration service returned an invalid response"},{status:502,headers:{"Cache-Control":"no-store"}});
  const rooms=payload.rooms.filter((room:unknown):room is SafeRoom=>Boolean(room&&typeof room==="object"&&typeof (room as {documentId?:unknown}).documentId==="string"&&typeof (room as {ownerId?:unknown}).ownerId==="string"&&Array.isArray((room as {connections?:unknown}).connections))).map((room:SafeRoom)=>({...room,connections:room.connections.filter((connection:unknown)=>Boolean(connection&&typeof connection==="object"&&typeof (connection as {connectionId?:unknown}).connectionId==="string"&&typeof (connection as {userId?:unknown}).userId==="string"))}));
  return NextResponse.json({rooms},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request:NextRequest){
  const {auth,allowed}=await authorize(request);if(!auth.userId)return createAuthErrorResponse(auth);if(!allowed)return NextResponse.json({error:"Not authorized"},{status:403});
  const body=await request.json().catch(()=>({}));let path="";
  if(body.action==="revoke-session"&&typeof body.connectionId==="string")path=`/connections/${encodeURIComponent(body.connectionId)}/revoke`;
  if((body.action==="persist"||body.action==="drain")&&typeof body.documentId==="string")path=`/rooms/${encodeURIComponent(body.documentId)}/${body.action}`;
  if(!path)return NextResponse.json({error:"Invalid operation"},{status:400});
  const response=await wsControl(path,{method:"POST"}).catch(()=>null);if(!response)return NextResponse.json({error:"Collaboration service unavailable"},{status:503});
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload||payload.ok!==true)return NextResponse.json({error:"Collaboration operation failed"},{status:response.ok?502:response.status,headers:{"Cache-Control":"no-store"}});
  return NextResponse.json(payload,{headers:{"Cache-Control":"no-store"}});
}
