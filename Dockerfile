FROM nginx:1.27-alpine

# Copy only runtime files for this static site.
COPY index.html /usr/share/nginx/html/index.html
COPY assets /usr/share/nginx/html/assets
COPY data /usr/share/nginx/html/data
COPY skills /usr/share/nginx/html/skills

# WeChat Cloud Hosting commonly maps traffic to container port 80.
EXPOSE 80

# Keep nginx running in foreground.
CMD ["nginx", "-g", "daemon off;"]
