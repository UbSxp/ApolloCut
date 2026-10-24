import sys
# Read the checkpoint.ps1 file
with open('C:/Users/DUARDIN/ApolloCut/tools/checkpoint.ps1', 'rb') as f:
    content = f.read()

# Replace $pid = $PID with the correct approach
# The file contains literal bytes for $pid = $PID
old = b'\x24pid = \x24PID'  # $pid = $PID
new = b'\x24pid = [System.Diagnostics.Process]::GetCurrentProcess().Id'  # $pid = [System.Diagnostics.Process]::GetCurrentProcess().Id

if old in content:
    content = content.replace(old, new)
    print('Replaced successfully')
else:
    print('Old pattern not found')
    # Debug: find PID in file
    idx = content.find(b'PID')
    if idx != -1:
        print('Found PID at index', idx)
        print('Context:', repr(content[max(0,idx-30):idx+30]))

with open('C:/Users/DUARDIN/ApolloCut/tools/checkpoint.ps1', 'wb') as f:
    f.write(content)
print('Done')