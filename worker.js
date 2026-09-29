const COLLECTIONS = {
  docs: "docs",
  canais: "canais",
  contatos: "contatos",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(message, code, status = 400) {
  return json(
    {
      error: message,
      code,
    },
    status
  );
}

function now() {
  return new Date().toISOString();
}

async function getSnapshot(env) {
  const snapshot = {
    docs: [],
    canais: [],
    contatos: [],
    savedAt: null,
  };

  for (const col of Object.keys(COLLECTIONS)) {
    const table = COLLECTIONS[col];

    const result = await env.DB.prepare(
      `SELECT id, data, updated_at FROM ${table} ORDER BY rowid`
    ).all();

    snapshot[col] = result.results.map((row) => {
      let data = {};

      try {
        data = JSON.parse(row.data || "{}");
      } catch {
        data = {};
      }

      return {
        id: row.id,
        ...data,
      };
    });

    const latest = await env.DB.prepare(
      `SELECT MAX(updated_at) AS savedAt FROM ${table}`
    ).first();

    if (latest?.savedAt) {
      if (!snapshot.savedAt || latest.savedAt > snapshot.savedAt) {
        snapshot.savedAt = latest.savedAt;
      }
    }
  }

  return snapshot;
}

async function saveOperation(env, operation) {
  const { col, id, op, data } = operation;

  if (!COLLECTIONS[col]) {
    throw new Error(`Coleção inválida: ${col}`);
  }

  if (!id) {
    throw new Error("ID não informado.");
  }

  const table = COLLECTIONS[col];

  if (op === "delete") {
    await env.DB.prepare(
      `DELETE FROM ${table} WHERE id = ?`
    )
      .bind(id)
      .run();

    return;
  }

  if (op !== "set") {
    throw new Error(`Operação inválida: ${op}`);
  }

  if (!data || typeof data !== "object") {
    throw new Error("Dados inválidos.");
  }

  const cleanData = { ...data };

  // O ID é armazenado separadamente.
  delete cleanData.id;

  const serialized = JSON.stringify(cleanData);
  const updatedAt = now();

  await env.DB.prepare(`
    INSERT INTO ${table} (id, data, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id)
    DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `)
    .bind(id, serialized, updatedAt)
    .run();
}

async function handleApi(request, env) {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/api/data") {
    try {
      const snapshot = await getSnapshot(env);
      return json(snapshot);
    } catch (error) {
      console.error("GET /api/data:", error);

      return errorResponse(
        "Não foi possível consultar o banco D1.",
        "db_error",
        500
      );
    }
  }

  if (request.method === "POST" && url.pathname === "/api/save") {
    try {
      const body = await request.json();

      if (!body || !Array.isArray(body.ops)) {
        return errorResponse(
          "O corpo da requisição precisa conter um array 'ops'.",
          "invalid_payload"
        );
      }

      /*
       * Executamos cada alteração individualmente.
       * O frontend envia objetos no formato:
       *
       * {
       *   col: "docs",
       *   id: "...",
       *   op: "set",
       *   data: {...}
       * }
       */

      for (const operation of body.ops) {
        await saveOperation(env, operation);
      }

      const snapshot = await getSnapshot(env);

      return json(snapshot);
    } catch (error) {
      console.error("POST /api/save:", error);

      return errorResponse(
        error.message || "Não foi possível salvar.",
        "db_error",
        500
      );
    }
  }

  return errorResponse("Endpoint não encontrado.", "not_found", 404);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const url = new URL(request.url);

    /*
     * API do portal
     */
    if (
      url.pathname === "/api/data" ||
      url.pathname === "/api/save"
    ) {
      if (!env.DB) {
        return errorResponse(
          "O banco D1 não está ligado ao Worker.",
          "db_missing",
          500
        );
      }

      return handleApi(request, env);
    }

    /*
     * Para qualquer outra rota:
     *
     * O Worker tenta entregar o index.html
     * usando o binding ASSETS.
     *
     * Isso permite que o mesmo Worker seja responsável
     * pelo frontend e pela API.
     */

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response(
      "Portal das Filiais - Worker funcionando. O binding ASSETS não está configurado.",
      {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      }
    );
  },
};
