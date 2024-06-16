'use client'
import Editor from '@monaco-editor/react'
/**
 * @author: snomiao <snomiao@gmail.com>
 */
export default  function CommentEditor({onChange, defaultValue, defaultLanguage}) {
return     <Editor
      height="90vh"
      defaultLanguage="markdown"
      defaultValue="write comment template here"
      onChange={function handleEditorChange(value, event) {
        // here is the current value
        onChange(value)
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
        markers.forEach(marker => console.log('onValidate:', marker.message));
      }}
    />
};
