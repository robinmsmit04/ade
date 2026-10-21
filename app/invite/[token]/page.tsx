import { redirect } from "next/navigation";

// Old invitation links lead to the same shared group as the public app URL.
export default function Invite() {
  redirect("/");
}
