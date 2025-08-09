FROM nginx:alpine

# Install openssl for SSL certificate generation
RUN apk add --no-cache openssl

# Copy the SSL generation script
COPY generate-ssl.sh /usr/local/bin/generate-ssl.sh

# Make the script executable
RUN chmod +x /usr/local/bin/generate-ssl.sh

# Generate SSL certificates
RUN /bin/sh /usr/local/bin/generate-ssl.sh

# Copy nginx configuration files
COPY nginx.conf /etc/nginx/nginx.conf
COPY default.conf /etc/nginx/conf.d/default.conf

# Expose ports
EXPOSE 80 443

# Start nginx
CMD ["nginx", "-g", "daemon off;"]