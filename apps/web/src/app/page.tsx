import { redirect } from "next/navigation";

export default function Home() {
  redirect("/workspaces/command-center");
}