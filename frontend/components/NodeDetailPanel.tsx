"use client";

import { GreenNode, GreenEdge, CLUSTER_COLORS, EDGE_LABELS } from "@/lib/types";

interface NodeDetailPanelProps {
  node: GreenNode;
  edges: GreenEdge[];
  allNodes: GreenNode[];
  onClose: () => void;
  onNodeNavigate: (node: GreenNode) => void;
  lang: "es" | "en";
}

const t = {
  es: {
    cluster: "Cluster",
    category: "Categoría",
    funding: "Financiamiento",
    partners: "Aliados / Portfolio",
    clients: "Clientes",
    description: "Descripción",
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
  },
};

export default function NodeDetailPanel({
  node,
  edges,
  allNodes,
  onClose,
  onNodeNavigate,
  lang,
}: NodeDetailPanelProps) {
  const labels = t[lang];
  const clusterColor = CLUSTER_COLORS[node.cluster] || "#6b7280";

  // Find connections
  const outgoing = edges.filter((e) => e.source_id === node.id);
  const incoming = edges.filter((e) => e.target_id === node.id);
  const nodeMap = Object.fromEntries(allNodes.map((n) => [n.id, n]));

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-zinc-900/95 backdrop-blur-md border-l border-zinc-700 overflow-y-auto z-50 shadow-2xl">
      {/* Header */}
      <div className="sticky top-0 bg-zinc-900/95 backdrop-blur-md p-4 border-b border-zinc-700">
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
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition p-1"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Verification badge */}
        <div className="mt-2">
          {node.verified ? (
            <div className="flex items-center gap-1.5 text-green-400 text-xs">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
              {labels.verified}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              {labels.unverified}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
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
            <p className="text-white text-sm">
              {node.followers.toLocaleString()}
            </p>
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
                <span
                  key={p}
                  className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded"
                >
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
                <span
                  key={c}
                  className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded"
                >
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
                    style={{
                      backgroundColor:
                        CLUSTER_COLORS[targetNode.cluster] || "#6b7280",
                    }}
                  />
                  <span className="text-zinc-300 flex-1 truncate">
                    {targetNode.nombre}
                  </span>
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
                    style={{
                      backgroundColor:
                        CLUSTER_COLORS[sourceNode.cluster] || "#6b7280",
                    }}
                  />
                  <span className="text-zinc-300 flex-1 truncate">
                    {sourceNode.nombre}
                  </span>
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
