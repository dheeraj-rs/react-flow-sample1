"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactFlow, { 
  useNodesState, 
  useEdgesState, 
  addEdge, 
  MiniMap, 
  Controls,
  Background,
  useReactFlow,
  ConnectionLineType,
  Node,
  Edge,
  XYPosition,
  Connection,
  NodeChange,
  EdgeChange,
  Viewport
} from 'reactflow';
import 'reactflow/dist/style.css';
import '@/styles/FlowEditor.scss';
import CustomNode from './CustomNode';
import CustomControls from './CustomControls';
import CustomEdge from './CustomEdge';
import { initialNodes, initialEdges } from '@/lib/flowData';
import useHistory from '@/hooks/useHistory';
import useBoundedNodes from '@/hooks/useBoundedNodes';

const nodeTypes = {
  custom: CustomNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

interface FlowEditorProps {
  title?: string;
}

const FlowEditor: React.FC<FlowEditorProps> = ({ title = 'Flow Editor' }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { getViewport, setViewport, project, fitView } = useReactFlow();
  
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [isArranging, setIsArranging] = useState(false);
  
  const { addToHistory, undo, redo, canUndo, canRedo } = useHistory(nodes, edges, setNodes, setEdges);
  const { boundedNodesHandler } = useBoundedNodes();
  
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.sourceHandle && connection.targetHandle) {
        const sourceNode = nodes.find(n => n.id === connection.source);
        const targetNode = nodes.find(n => n.id === connection.target);
        
        if (sourceNode && targetNode) {
          const newEdge = {
            ...connection,
            type: 'custom',
            animated: true,
            style: { stroke: 'var(--color-edge)' },
            data: { label: 'connected' }
          };
          
          setEdges((eds) => {
            const newEdges = addEdge(newEdge, eds);
            addToHistory(nodes, newEdges);
            return newEdges;
          });
        }
      }
    },
    [nodes, setEdges, addToHistory]
  );

  useEffect(() => {
    const handleEdgeRemove = (event: CustomEvent) => {
      const edgeId = event.detail.id;
      setEdges((eds) => {
        const newEdges = eds.filter(e => e.id !== edgeId);
        addToHistory(nodes, newEdges);
        return newEdges;
      });
    };

    document.addEventListener('edgeRemove', handleEdgeRemove as EventListener);
    return () => {
      document.removeEventListener('edgeRemove', handleEdgeRemove as EventListener);
    };
  }, [nodes, setEdges, addToHistory]);
  
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);
  
  const onNodeMouseEnter = useCallback((event: React.MouseEvent, node: Node) => {
    setHoveredNode(node);
  }, []);
  
  const onNodeMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, []);
  
  const onNodesChangeWithHistory = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      const positionChange = changes.find(change => change.type === 'position' && change.dragging === false);
      if (positionChange) {
        addToHistory(nodes, edges);
      }
    },
    [nodes, edges, onNodesChange, addToHistory]
  );
  
  const onEdgesChangeWithHistory = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);
      const removeChange = changes.find(change => change.type === 'remove');
      if (removeChange) {
        addToHistory(nodes, edges);
      }
    },
    [nodes, edges, onEdgesChange, addToHistory]
  );

  const getNodeConnections = (nodeId: string) => {
    const rightConnections = edges.filter(edge => 
      edge.source === nodeId && edge.sourceHandle?.endsWith('-right')
    );
    const bottomConnections = edges.filter(edge => 
      edge.source === nodeId && edge.sourceHandle?.endsWith('-bottom')
    );
    return { rightConnections, bottomConnections };
  };

  const arrangeNodesRecursively = (
    nodeId: string,
    level: number,
    column: number,
    processedNodes: Set<string>,
    nodePositions: Map<string, { x: number, y: number }>
  ) => {
    if (processedNodes.has(nodeId)) return;
    processedNodes.add(nodeId);

    const HORIZONTAL_SPACING = 250;
    const VERTICAL_SPACING = 150;

    nodePositions.set(nodeId, {
      x: column * HORIZONTAL_SPACING,
      y: level * VERTICAL_SPACING
    });

    const { rightConnections, bottomConnections } = getNodeConnections(nodeId);

    // Process right connections first (same level, next column)
    rightConnections.forEach(edge => {
      arrangeNodesRecursively(
        edge.target,
        level,
        column + 1,
        processedNodes,
        nodePositions
      );
    });

    // Then process bottom connections (next level, same column)
    bottomConnections.forEach(edge => {
      arrangeNodesRecursively(
        edge.target,
        level + 1,
        column,
        processedNodes,
        nodePositions
      );
    });
  };
  
  const autoArrangeNodes = useCallback(() => {
    setIsArranging(true);

    // Find root nodes (nodes with no incoming edges)
    const targetNodes = new Set(edges.map(e => e.target));
    const rootNodes = nodes.filter(node => !targetNodes.has(node.id));

    const processedNodes = new Set<string>();
    const nodePositions = new Map<string, { x: number, y: number }>();
    
    // Constants for spacing
    const HORIZONTAL_GAP = 300;
    const VERTICAL_GAP = 200;
    const LEVEL_OFFSET = 100;

    // Start arrangement from each root node
    rootNodes.forEach((rootNode, rootIndex) => {
      const startX = rootIndex * HORIZONTAL_GAP;
      let maxY = 0;

      const arrangeFromNode = (nodeId: string, level: number, x: number, y: number) => {
        if (processedNodes.has(nodeId)) return;
        processedNodes.add(nodeId);

        // Position current node
        nodePositions.set(nodeId, { x, y });
        maxY = Math.max(maxY, y);

        // Get node connections
        const { rightConnections, bottomConnections } = getNodeConnections(nodeId);

        // Arrange right connections
        rightConnections.forEach((edge, idx) => {
          const nextX = x + HORIZONTAL_GAP;
          const nextY = y + (idx * VERTICAL_GAP);
          arrangeFromNode(edge.target, level, nextX, nextY);
        });

        // Arrange bottom connections
        bottomConnections.forEach((edge, idx) => {
          const nextX = x;
          const nextY = y + VERTICAL_GAP + LEVEL_OFFSET;
          arrangeFromNode(edge.target, level + 1, nextX, nextY);
        });
      };

      arrangeFromNode(rootNode.id, 0, startX, 0);
    });

    // Update node positions
    const newNodes = nodes.map(node => ({
      ...node,
      position: nodePositions.get(node.id) || node.position
    }));

    setNodes(newNodes);
    
    setTimeout(() => {
      fitView({ padding: 0.3 });
      setIsArranging(false);
      addToHistory(newNodes, edges);
    }, 500);
  }, [nodes, edges, setNodes, fitView, addToHistory, getNodeConnections]);
  
  const deleteSelected = useCallback(() => {
    setNodes(nodes.filter(node => !node.selected));
    setEdges(edges.filter(edge => !edge.selected));
    
    addToHistory(
      nodes.filter(node => !node.selected),
      edges.filter(edge => !edge.selected)
    );
  }, [nodes, edges, setNodes, setEdges, addToHistory]);
  
  const addNode = useCallback(() => {
    const id = `node-${nodes.length + 1}`;
    const newNode = {
      id,
      type: 'custom',
      position: {
        x: Math.random() * 300,
        y: Math.random() * 300
      },
      data: {
        label: `Node ${nodes.length + 1}`,
        content: 'New node content',
        type: 'default'
      }
    };
    
    const newNodes = nodes.concat(newNode);
    setNodes(newNodes);
    addToHistory(newNodes, edges);
  }, [nodes, edges, setNodes, addToHistory]);
  
  const onPaneReady = useCallback(() => {
    fitView({ padding: 0.2 });
  }, [fitView]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      
      if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
        e.preventDefault();
        redo();
      }
      
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement === document.body) {
          e.preventDefault();
          deleteSelected();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, deleteSelected]);
  
  useEffect(() => {
    boundedNodesHandler(nodes, setNodes);
  }, [nodes, boundedNodesHandler, setNodes]);
  
  return (
    <div className="flow-editor-container">
      <div className="flow-editor-header">
        <h1>{title}</h1>
        <button onClick={addNode}>Add Node</button>
      </div>
      
      <div className="flow-editor-wrapper" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChangeWithHistory}
          onEdgesChange={onEdgesChangeWithHistory}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          onPaneReady={onPaneReady}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionLineType={ConnectionLineType.SmoothStep}
          defaultEdgeOptions={{
            type: 'custom',
            animated: false
          }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          snapToGrid
          snapGrid={[15, 15]}
        >
          <CustomControls
            onUndo={undo}
            onRedo={redo}
            onAutoArrange={autoArrangeNodes}
            onDeleteSelected={deleteSelected}
            canUndo={canUndo}
            canRedo={canRedo}
          />
          <Background color="#aaa" gap={16} />
          <MiniMap 
            nodeStrokeWidth={3}
            nodeColor={(node) => {
              if (node.selected) return 'var(--color-primary)';
              return 'var(--color-node-border)';
            }}
            maskColor="rgba(240, 240, 240, 0.5)"
          />
          <Controls showInteractive={false} />
        </ReactFlow>
        
        {isArranging && (
          <div className="auto-arrange-overlay">
            <div className="indicator">
              <span>Arranging nodes...</span>
            </div>
          </div>
        )}
        
        <div className="status-bar">
          <div className="status-item">
            <span>Nodes: {nodes.length}</span>
          </div>
          <div className="status-item">
            <span>Connections: {edges.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowEditor;