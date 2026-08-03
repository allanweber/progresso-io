import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OtpInput } from "@/components/auth/otp-input";

/** Controlled wrapper so the component reflects onChange like a real form. */
function Harness({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <OtpInput
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      autoFocus
    />
  );
}

describe("OtpInput", () => {
  it("renders one box per digit", () => {
    render(<Harness />);
    expect(screen.getAllByRole("textbox")).toHaveLength(6);
  });

  it("accepts digits, ignores letters, and advances focus", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const boxes = screen.getAllByRole("textbox") as HTMLInputElement[];
    await user.type(boxes[0], "1");
    expect(onChange).toHaveBeenLastCalledWith("1");
    expect(boxes[1]).toHaveFocus();

    // Letters are stripped.
    await user.type(boxes[1], "a");
    expect(boxes[1].value).toBe("");

    await user.type(boxes[1], "2");
    expect(onChange).toHaveBeenLastCalledWith("12");
  });

  it("fills every box from a pasted code", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const boxes = screen.getAllByRole("textbox") as HTMLInputElement[];
    boxes[0].focus();
    await user.paste("123456");

    expect(onChange).toHaveBeenLastCalledWith("123456");
    expect(boxes[5].value).toBe("6");
  });

  it("clears the current box on backspace", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const boxes = screen.getAllByRole("textbox") as HTMLInputElement[];

    await user.type(boxes[0], "5");
    expect(boxes[1]).toHaveFocus();
    await user.keyboard("{Backspace}");
    // Focus moves back and the previous digit is cleared.
    expect(boxes[0].value).toBe("");
  });
});
