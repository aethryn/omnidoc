import { redirect } from "next/navigation";
import { getCurrentAuth } from "@/lib/auth";
import { isOperator } from "@/lib/operator";
import CollaborationAdmin from "./CollaborationAdmin";

export default async function CollaborationAdminPage(){
  const auth=await getCurrentAuth();if(!auth.userId)redirect("/signin?redirect=/admin/collaboration");if(!isOperator(auth.userId))redirect("/dashboard");
  return <CollaborationAdmin/>;
}
