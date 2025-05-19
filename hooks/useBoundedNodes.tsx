"use client";

import { useCallback, useState, useEffect } from 'react';
import { Node, useReactFlow } from 'reactflow';

const useBoundedNodes = (padding: number = 20) => {
  const { getViewport } = useReactFlow();
  const [viewportDimensions, setViewportDimensions] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const updateViewportDimensions = () => {
      const reactFlowContainer = document.querySelector('.react-flow');
      if (reactFlowContainer) {
        const { width, height } = reactFlowContainer.getBoundingClientRect();
        setViewportDimensions({ width, height });
      }
    };

    // Initial update
    updateViewportDimensions();
    
    // Update on resize
    const resizeObserver = new ResizeObserver(updateViewportDimensions);
    const reactFlowContainer = document.querySelector('.react-flow');
    if (reactFlowContainer) {
      resizeObserver.observe(reactFlowContainer);
    }

    // Update on window resize as fallback
    window.addEventListener('resize', updateViewportDimensions);

    return () => {
      if (reactFlowContainer) {
        resizeObserver.unobserve(reactFlowContainer);
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateViewportDimensions);
    };
  }, []);

  const boundedNodesHandler = useCallback(
    (nodes: Node[], setNodes: (nodes: Node[]) => void) => {
      const { width, height } = viewportDimensions;
      if (width === 0 || height === 0) return;

      const viewport = getViewport();
      const { zoom, x: viewportX, y: viewportY } = viewport;

      // Node dimensions
      const nodeWidth = 180;
      const nodeHeight = 150;

      // Calculate viewport boundaries in flow coordinates
      const minX = -viewportX / zoom + padding;
      const minY = -viewportY / zoom + padding;
      const maxX = (width - nodeWidth * zoom) / zoom - viewportX / zoom - padding;
      const maxY = (height - nodeHeight * zoom) / zoom - viewportY / zoom - padding;

      let needsUpdate = false;
      const updatedNodes = nodes.map(node => {
        let { x, y } = node.position;
        let isOutOfBounds = false;

        // Check and adjust X position
        if (x < minX) {
          x = minX;
          isOutOfBounds = true;
        } else if (x > maxX) {
          x = maxX;
          isOutOfBounds = true;
        }

        // Check and adjust Y position
        if (y < minY) {
          y = minY;
          isOutOfBounds = true;
        } else if (y > maxY) {
          y = maxY;
          isOutOfBounds = true;
        }

        if (isOutOfBounds) {
          needsUpdate = true;
          return {
            ...node,
            position: { x, y },
          };
        }

        return node;
      });

      if (needsUpdate) {
        setNodes(updatedNodes);
      }
    },
    [getViewport, viewportDimensions, padding]
  );

  return {
    boundedNodesHandler,
    viewportDimensions,
  };
};

export default useBoundedNodes;