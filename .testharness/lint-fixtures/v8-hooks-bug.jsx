// Reproduction of the v8 blank-page bug. This file is NOT part of the app.
// run.sh lints it and expects react-hooks/rules-of-hooks to FAIL — proving the rule is active.
import { useRef, useState } from "react";

export function LogView({ current }) {
  const [picking] = useState(false);
  if (!current) return <div>Ready to lift?</div>;
  const cardRefs = useRef([]); // hook after an early return: the v8 bug
  const [dragIdx, setDragIdx] = useState(null);
  return <div ref={cardRefs} data-i={dragIdx} onClick={() => setDragIdx(picking ? 1 : 0)} />;
}
