export function shouldBlockPublicWebsite() {
  if (import.meta.env.VITE_DISABLE_PUBLIC_WEB !== "true") return false;
  if (typeof window === "undefined") return false;

  const localHosts = ["localhost", "127.0.0.1", "::1"];
  if (localHosts.includes(window.location.hostname)) return false;
  if (window.location.search.includes("app=1")) return false;

  return true;
}
