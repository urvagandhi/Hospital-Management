import os
import re

dir_path = "/media/urva/Personal/Technical/Project/Urva/Hospital-Management/android-app/app/src/main/java"
file_logger_import = "import com.hospital.management.utils.FileLogger"

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original_content = content

    # Replace inline full packages
    content = re.sub(r'android\.util\.Log\.([vdiwe]|wtf)\(', r'FileLogger.\1(', content)

    # Replace Log.x( with FileLogger.x(
    content = re.sub(r'\bLog\.([vdiwe]|wtf)\(', r'FileLogger.\1(', content)

    # Convert FileLogger.v( to FileLogger.d( since v is not implemented in FileLogger
    content = content.replace("FileLogger.v(", "FileLogger.d(")

    if content != original_content:
        # If we replaced something, we need to ensure FileLogger is imported
        if file_logger_import not in content:
            # Replace android.util.Log with FileLogger, or add it if not present
            if "import android.util.Log" in content:
                content = content.replace("import android.util.Log", file_logger_import)
            else:
                # Find the last import and add it after
                imports = list(re.finditer(r'^import .+$', content, flags=re.MULTILINE))
                if imports:
                    last_import = imports[-1]
                    idx = last_import.end()
                    content = content[:idx] + "\n" + file_logger_import + content[idx:]
                else:
                    # Find package declaration
                    pkg = re.search(r'^package .+$', content, flags=re.MULTILINE)
                    if pkg:
                        idx = pkg.end()
                        content = content[:idx] + "\n\n" + file_logger_import + content[idx:]
        else:
            # If it's already imported, just remove android.util.Log if present
            content = content.replace("import android.util.Log\n", "")

        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, _, files in os.walk(dir_path):
    for file in files:
        if file.endswith(".kt"):
            process_file(os.path.join(root, file))

print("Done!")
