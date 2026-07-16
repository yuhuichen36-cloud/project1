#!/usr/bin/env ruby
# frozen_string_literal: true
# AETHER-2 — serve on all network interfaces (LAN shareable)

require "webrick"
require "socket"

PORT = (ARGV[0] || "5173").to_i
ROOT = File.expand_path(__dir__)

def lan_ips
  Socket.ip_address_list
        .select { |a| a.ipv4? && !a.ipv4_loopback? }
        .map(&:ip_address)
        .uniq
end

server = WEBrick::HTTPServer.new(
  Port: PORT,
  BindAddress: "0.0.0.0",
  DocumentRoot: ROOT,
  AccessLog: [],
  Logger: WEBrick::Log.new($stderr, WEBrick::Log::INFO)
)

puts ""
puts "  AETHER-2 is running"
puts "  ---------------------------------"
puts "  This computer:  http://127.0.0.1:#{PORT}/"
lan_ips.each do |ip|
  puts "  Others use:     http://#{ip}:#{PORT}/"
end
puts "  ---------------------------------"
puts "  Do NOT send localhost to others — it only works on your Mac."
puts "  Same Wi-Fi required. Ctrl+C to stop."
puts ""

trap("INT") { server.shutdown }
trap("TERM") { server.shutdown }
server.start
