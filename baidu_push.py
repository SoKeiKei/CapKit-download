import requests
import xml.etree.ElementTree as ET
import os

def push_to_baidu():
    # 从 sitemap.xml 提取 URL
    sitemap_path = 'sitemap.xml'
    if not os.path.exists(sitemap_path):
        print("Sitemap not found!")
        return

    tree = ET.parse(sitemap_path)
    root = tree.getroot()
    # XML namespace handling
    ns = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    urls = [loc.text for loc in root.findall('.//ns:loc', ns)]

    if not urls:
        print("No URLs found in sitemap.")
        return

    print(f"Submitting {len(urls)} URLs...")
    
    # 百度推送接口地址
    # 注意：为了安全，token 应该通过环境变量传递
    token = os.environ.get('BAIDU_TOKEN', 'ONVJkMczIY3cppvi')
    api_url = f"http://data.zz.baidu.com/urls?site=https://www.capkit.top&token={token}"

    headers = {'Content-Type': 'text/plain'}
    data = '\n'.join(urls)

    try:
        response = requests.post(api_url, headers=headers, data=data)
        result = response.json()
        print("Response from Baidu:")
        print(result)
        
        if 'success' in result:
            print(f"Successfully pushed {result['success']} URLs.")
        else:
            print("Failed to push URLs.")
    except Exception as e:
        print(f"Error occurred: {e}")

if __name__ == "__main__":
    push_to_baidu()
