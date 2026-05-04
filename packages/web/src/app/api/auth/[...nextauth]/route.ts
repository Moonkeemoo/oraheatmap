// Catch-all Auth.js route handler — exports GET + POST that next-auth wires
// up internally for /signin, /signout, /callback/{provider}, /session, etc.
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
