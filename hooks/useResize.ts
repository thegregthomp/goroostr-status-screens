import React, { useEffect, useRef, useState } from "react";

export default function useResize() {
  const screenSize = useRef();
  const [currentSize, setCurrentSize] = useState([]);

  useEffect(() => {
      window.addEventListener("resize", () => {
          screenSize.current = [window.innerWidth, window.innerHeight];
          setCurrentSize(screenSize.current);
      });
      return () => {
          window.removeEventListener("resize", () => {
            screenSize.current = [window.innerWidth, window.innerHeight];
          })
      }
  }, []);
  
  return currentSize;
}