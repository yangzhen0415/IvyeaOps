export default async function handler() {
  return new Response(
    JSON.stringify({
      detail:
        "IvyeaOps backend is not deployed. Deploy the FastAPI server separately and update netlify.toml to proxy /api/* to that backend.",
    }),
    {
      status: 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

export const config = {
  path: "/.netlify/functions/api-unavailable",
};
