import ReactMarkdown from 'react-markdown';
import { openFileAtLine, getWorkspaceFiles } from '../utils/remix/apiRemix.ts';

interface MessageProps {
  text: string;
}

export function ChatMessageView({ text }: MessageProps) {
  return (
    <ReactMarkdown
      urlTransform={(url) => url}
      components={{
        a: ({ href, children }) => {
          if (!href) return <span>{children}</span>;

          const handleClick = async (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();

            try {
              // 1. Sanitize custom protocol prefixes from LLM response strings
              const cleanPath = href.replace(/^remix:\/\//, '');
              const [rawFilePath, queryString] = cleanPath.split('?');
              
              let targetPath = rawFilePath.startsWith('/') ? rawFilePath : `/${rawFilePath}`;
              let line = 1;

              if (queryString) {
                const lineMatch = queryString.match(/line=(\d+)/);
                if (lineMatch) {
                  line = parseInt(lineMatch[1], 10);
                }
              }

              // 2. Dynamic Path Resolution Loop
              try {
                console.log(`[Link Intercepted] Attempting target path redirection: ${targetPath} | Line: ${line}`);
                await openFileAtLine(targetPath, line);
              } catch (directError) {
                console.warn(`[Workspace Resolver] Direct match failed. Initiating substring search for: ${targetPath}`);
                
                const fileName = targetPath.split('/').pop();
                
                if (fileName) {
                  // Fetch the currently indexed file list to resolve path mismatches safely
                  const activeFiles = await getWorkspaceFiles();
                  
                  const matchedFile = activeFiles.find(f => {
                    const normalizedFile = f.path.startsWith('/') ? f.path : `/${f.path}`;
                    return normalizedFile.endsWith(targetPath) || targetPath.endsWith(normalizedFile) || normalizedFile.endsWith(fileName);
                  });

                  if (matchedFile) {
                    const resolvedPath = matchedFile.path.startsWith('/') ? matchedFile.path : `/${matchedFile.path}`;
                    console.log(`[Workspace Resolver] File match discovered! Redirecting interface context to: ${resolvedPath}`);
                    await openFileAtLine(resolvedPath, line);
                    return;
                  }
                }
                throw directError;
              }

            } catch (err) {
              console.error('[Navigation Error] Definitive workspace file opening failure:', err);
            }
          };

          return (
            <button
              className="reference-link-btn"
              type="button"
              onClick={handleClick}
            >
              {children}
            </button>
          );
        }
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
