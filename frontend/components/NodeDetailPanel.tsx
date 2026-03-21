"use client";

import { GreenNode, GreenEdge, CLUSTER_COLORS, EDGE_LABELS, NodeVerificationState } from "@/lib/types";

interface NodeDetailPanelProps {
  node: GreenNode;
  edges: GreenEdge[];
  allNodes: GreenNode[];
  onClose: () => void;
  onNodeNavigate: (node: GreenNode) => void;
  lang: "es" | "en";
  verificationState?: NodeVerificationState;
  onVerify?: (node: GreenNode) => void;
  onSocialAudit?: (node: GreenNode) => void;
}

const explorerUrl = process.env.NEXT_PUBLIC_GENLAYER_EXPLORER || "https://explorer-bradbury.genlayer.com";

const t = {
  es: {
    cluster: "Cluster",
    category: "Categoria",
    funding: "Financiamiento",
    partners: "Aliados / Portfolio",
    clients: "Clientes",
    description: "Descripcion",
    connections: "Conexiones",
    verified: "Verificado en GenLayer",
    unverified: "No verificado",
    followers: "Seguidores",
    website: "Sitio web",
    source: "Fuente",
    funds: "Fondea a",
    funded_by: "Fondeado por",
    partners_with: "Aliado con",
    client_of: "Cliente de",
    verify_btn: "Verificar en GenLayer",
    social_btn: "Auditar Redes Sociales",
    verifying: "Verificando...",
    verification_results: "Resultados de Verificacion",
    social_results: "Auditoria Social",
    exists: "Existe",
    argentina: "Relacionado con Argentina",
    green: "Sector Verde",
    desc_accurate: "Descripcion Precisa",
    accuracy: "Precision",
    reasoning: "Razonamiento",
    view_tx: "Ver transaccion",
    retry: "Reintentar",
    failed: "Consenso no alcanzado",
    unverified_result: "Resultado sin verificar (solo lider)",
    social_score: "Puntaje Social",
    activity: "Actividad",
    follower_match: "Seguidores coinciden",
    real_account: "Cuenta real",
  },
  en: {
    cluster: "Cluster",
    category: "Category",
    funding: "Funding",
    partners: "Partners / Portfolio",
    clients: "Clients",
    description: "Description",
    connections: "Connections",
    verified: "Verified on GenLayer",
    unverified: "Not verified",
    followers: "Followers",
    website: "Website",
    source: "Source",
    funds: "Funds",
    funded_by: "Funded by",
    partners_with: "Partners with",
    client_of: "Client of",
    verify_btn: "Verify on GenLayer",
    social_btn: "Social Media Audit",
    verifying: "Verifying...",
    verification_results: "Verification Results",
    social_results: "Social Audit",
    exists: "Exists",
    argentina: "Argentina Related",
    green: "Green Sector",
    desc_accurate: "Description Accurate",
    accuracy: "Accuracy",
    reasoning: "Reasoning",
    view_tx: "View transaction",
    retry: "Retry",
    failed: "Consensus not reached",
    unverified_result: "Unverified result (leader only)",
    social_score: "Social Score",
    activity: "Activity",
    follower_match: "Followers Match",
    real_account: "Real Account",
  },
};

function CheckIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="text-green-400">&#10003;</span>
  ) : (
    <span className="text-red-400">&#10007;</span>
  );
}

function ScoreBadge({ score }: { score: string }) {
  const colors: Record<string, string> = {
    high: "bg-green-900/50 text-green-400",
    medium: "bg-yellow-900/50 text-yellow-400",
    low: "bg-red-900/50 text-red-400",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[score] || colors.low}`}>
      {score}
    </span>
  );
}

export default function NodeDetailPanel({
  node,
  edges,
  allNodes,
  onClose,
  onNodeNavigate,
  lang,
  verificationState,
  onVerify,
  onSocialAudit,
}: NodeDetailPanelProps) {
  const labels = t[lang];
  const clusterColor = CLUSTER_COLORS[node.cluster] || "#6b7280";

  const outgoing = edges.filter((e) => e.source_id === node.id);
  const incoming = edges.filter((e) => e.target_id === node.id);
  const nodeMap = Object.fromEntries(allNodes.map((n) => [n.id, n]));

  const isVerified = node.verified || verificationState?.status === "finalized" || verificationState?.status === "accepted";
  const isPending = verificationState?.status === "pending";
  const isFailed = verificationState?.status === "failed";
  const isSocialPending = verificationState?.socialStatus === "pending";
  const isSocialFailed = verificationState?.socialStatus === "failed";
  const hasSocialResult = verificationState?.socialStatus === "finalized" || verificationState?.socialStatus === "accepted";

  // Only show social audit for nodes with social media links
  const hasSocialLink = node.link && /instagram|linkedin|twitter|x\.com|facebook|tiktok|youtube/.test(node.link);

  return (
    <div className="absolute right-0 top-0 h-full w-96 bg-[#161615]/95 backdrop-blur-md border-l border-[#2a2a28] overflow-y-auto z-50 shadow-2xl">
      {/* Header */}
      <div className="sticky top-0 bg-[#161615]/95 backdrop-blur-md p-4 border-b border-[#2a2a28] z-10">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">{node.nombre}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: clusterColor + "30", color: clusterColor }}
              >
                {node.cluster}
              </span>
              <span className="text-xs text-zinc-400">{node.categoria}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition p-1">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Verification badge */}
        <div className="mt-2">
          {isPending ? (
            <div className="flex items-center gap-2 text-amber-400 text-xs">
              <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              {labels.verifying}
            </div>
          ) : isVerified ? (
            <div className="flex items-center gap-1.5 text-green-400 text-xs">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              {labels.verified}
              {verificationState?.txHash && (
                <a
                  href={`${explorerUrl}/transactions/${verificationState.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline ml-1"
                >
                  {labels.view_tx}
                </a>
              )}
            </div>
          ) : node.verification_status === "grey" ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
                <span className="w-3 h-3 rounded-full bg-zinc-500 flex-shrink-0" />
                {lang === "es" ? "Revision manual necesaria" : "Manual review needed"}
                <span className="text-zinc-500">({node.verification_attempts || 0}/3 intentos)</span>
              </div>
              {node.verification_failure_reason && (
                <p className="text-xs text-zinc-500 pl-5 italic">
                  {node.verification_failure_reason.slice(0, 150)}
                </p>
              )}
            </div>
          ) : isFailed ? (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-red-400 text-xs">
                <span>&#10007;</span>
                {labels.failed}
                {node.verification_attempts ? (
                  <span className="text-zinc-500">({node.verification_attempts}/3)</span>
                ) : null}
                {onVerify && (
                  <button
                    onClick={() => onVerify(node)}
                    className="text-blue-400 hover:text-blue-300 underline ml-1"
                  >
                    {labels.retry}
                  </button>
                )}
              </div>
              {node.verification_failure_reason && (
                <p className="text-xs text-zinc-500 pl-5 italic">
                  {node.verification_failure_reason.slice(0, 150)}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              {labels.unverified}
            </div>
          )}
        </div>

        {/* Verify buttons */}
        <div className="mt-3 flex gap-2">
          {!isVerified && !isPending && onVerify && (
            <button
              onClick={() => onVerify(node)}
              className="flex-1 text-xs font-medium bg-[#1a6b4a] hover:bg-[#155a3e] text-white px-3 py-2 rounded-lg transition flex items-center justify-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.403 12.652a3 3 0 000-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              {labels.verify_btn}
            </button>
          )}
          {!hasSocialResult && !isSocialPending && onSocialAudit && hasSocialLink && (
            <button
              onClick={() => onSocialAudit(node)}
              className="flex-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg transition flex items-center justify-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
              </svg>
              {labels.social_btn}
            </button>
          )}
          {isSocialPending && (
            <div className="flex-1 text-xs text-amber-400 flex items-center justify-center gap-1.5 bg-zinc-800 rounded-lg py-2">
              <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              {labels.verifying}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Verification Results */}
        {verificationState?.result && !(verificationState.result as unknown as Record<string, unknown>).error && (
          <div className={`${isFailed ? "bg-amber-950/30 border-amber-800/50" : "bg-green-950/30 border-green-800/50"} border rounded-lg p-3 space-y-2`}>
            {isFailed && (
              <p className="text-xs text-amber-400 italic mb-1">{labels.unverified_result}</p>
            )}
            <h3 className={`text-xs font-semibold ${isFailed ? "text-amber-400" : "text-green-400"} uppercase tracking-wider`}>
              {labels.verification_results}
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-1.5">
                <CheckIcon ok={verificationState.result.exists} />
                <span className="text-zinc-300">{labels.exists}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckIcon ok={verificationState.result.argentina_related} />
                <span className="text-zinc-300">{labels.argentina}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckIcon ok={verificationState.result.green_sector} />
                <span className="text-zinc-300">{labels.green}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckIcon ok={verificationState.result.description_accurate} />
                <span className="text-zinc-300">{labels.desc_accurate}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-zinc-400">{labels.accuracy}:</span>
              <ScoreBadge score={verificationState.result.accuracy_score} />
            </div>
            {verificationState.result.reasoning && (
              <p className="text-xs text-zinc-400 mt-1">
                {verificationState.result.reasoning}
              </p>
            )}
          </div>
        )}

        {/* Social Audit Results */}
        {verificationState?.socialResult && (
          <div className="bg-blue-950/30 border border-blue-800/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                {labels.social_results}
              </h3>
              <ScoreBadge score={verificationState.socialResult.overall_social_score} />
            </div>
            {Object.entries(verificationState.socialResult.platforms || {}).map(
              ([platform, data]) => (
                <div key={platform} className="bg-zinc-800/50 rounded p-2 space-y-1">
                  <div className="text-xs font-medium text-white capitalize">{platform}</div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div className="flex items-center gap-1">
                      <CheckIcon ok={data.is_real_account} />
                      <span className="text-zinc-400">{labels.real_account}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <CheckIcon ok={data.follower_match} />
                      <span className="text-zinc-400">{labels.follower_match}</span>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-400">
                    {labels.followers}: {data.estimated_followers} | {labels.activity}: {data.activity_level}
                  </div>
                </div>
              )
            )}
            {verificationState.socialResult.reasoning && (
              <p className="text-xs text-zinc-400">{verificationState.socialResult.reasoning}</p>
            )}
            {verificationState.socialTxHash && (
              <a
                href={`${explorerUrl}/transactions/${verificationState.socialTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 underline"
              >
                {labels.view_tx}
              </a>
            )}
          </div>
        )}

        {/* Links */}
        {node.link && (
          <div>
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              {labels.website}
            </h3>
            <a
              href={node.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 text-sm underline break-all"
            >
              {node.link}
            </a>
          </div>
        )}

        {/* Followers */}
        {node.followers && (
          <div>
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              {labels.followers}
            </h3>
            <p className="text-white text-sm">{node.followers.toLocaleString()}</p>
          </div>
        )}

        {/* Description */}
        {node.descripcion && (
          <div>
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              {labels.description}
            </h3>
            <p className="text-zinc-300 text-sm">{node.descripcion}</p>
          </div>
        )}

        {/* Funding */}
        {node.quien_fondea && (
          <div>
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              {labels.funding}
            </h3>
            <p className="text-zinc-300 text-sm">{node.quien_fondea}</p>
          </div>
        )}

        {/* Partners */}
        {node.aliados_portfolio && node.aliados_portfolio.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              {labels.partners}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {node.aliados_portfolio.map((p) => (
                <span key={p} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Clients */}
        {node.clientes && node.clientes.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              {labels.clients}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {node.clientes.map((c) => (
                <span key={c} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Connections */}
        <div>
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            {labels.connections} ({outgoing.length + incoming.length})
          </h3>
          <div className="space-y-1.5">
            {outgoing.map((edge) => {
              const targetNode = nodeMap[edge.target_id];
              if (!targetNode) return null;
              return (
                <button
                  key={edge.id}
                  onClick={() => onNodeNavigate(targetNode)}
                  className="w-full text-left flex items-center gap-2 p-2 rounded bg-zinc-800/50 hover:bg-zinc-800 transition text-sm"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: CLUSTER_COLORS[targetNode.cluster] || "#6b7280" }}
                  />
                  <span className="text-zinc-300 flex-1 truncate">{targetNode.nombre}</span>
                  <span className="text-zinc-500 text-xs">
                    {EDGE_LABELS[edge.relationship_type] || edge.relationship_type}
                  </span>
                </button>
              );
            })}
            {incoming.map((edge) => {
              const sourceNode = nodeMap[edge.source_id];
              if (!sourceNode) return null;
              return (
                <button
                  key={edge.id}
                  onClick={() => onNodeNavigate(sourceNode)}
                  className="w-full text-left flex items-center gap-2 p-2 rounded bg-zinc-800/50 hover:bg-zinc-800 transition text-sm"
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: CLUSTER_COLORS[sourceNode.cluster] || "#6b7280" }}
                  />
                  <span className="text-zinc-300 flex-1 truncate">{sourceNode.nombre}</span>
                  <span className="text-zinc-500 text-xs">
                    {EDGE_LABELS[edge.relationship_type] || edge.relationship_type}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Source */}
        <div className="pt-2 border-t border-zinc-800">
          <span className="text-xs text-zinc-500">
            {labels.source}: {node.source === "agent" ? "AI Agent" : "Manual Research"}
          </span>
        </div>
      </div>
    </div>
  );
}
