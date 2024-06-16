"use client";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

loader.config({ monaco });

import Editor from "@monaco-editor/react";
/**
 * @author: snomiao <snomiao@gmail.com>
 */
export default function RuleEditor({
  onChange,
  defaultValue,
  defaultLanguage,
}: {
  onChange: (text?: string) => void;
  defaultValue: string;
  defaultLanguage: string;
}) {
  return (
    <Editor
      height="90vh"
      defaultLanguage={defaultLanguage}
      defaultValue={defaultValue}
      onChange={function handleEditorChange(value, event) {
        // here is the current value
        onChange(value);
      }}
      onMount={function handleEditorDidMount(editor, monaco) {
        console.log("onMount: the editor instance:", editor);
        console.log("onMount: the monaco instance:", monaco);
      }}
      beforeMount={function handleEditorWillMount(monaco) {
        console.log("beforeMount: the monaco instance:", monaco);
      }}
      onValidate={function handleEditorValidation(markers) {
        // model markers
        markers.forEach((marker) => console.log("onValidate:", marker.message));
      }}
    />
  );
}
