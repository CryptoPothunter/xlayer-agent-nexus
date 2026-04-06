// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ServiceRegistry
 * @notice On-chain registry for Agent-to-Agent services on X Layer
 * @dev Agents register services, other agents discover and pay for them
 */
contract ServiceRegistry {
    struct Service {
        address provider;
        string name;
        string description;
        string endpoint;       // HTTP endpoint for x402 payment
        uint256 pricePerCall;  // Price in wei (USDT on X Layer)
        uint256 totalCalls;
        uint256 totalRevenue;
        uint256 rating;        // Cumulative rating score
        uint256 ratingCount;
        bool active;
        uint256 registeredAt;
    }

    struct AgentProfile {
        address wallet;
        string name;
        uint256 totalServicesProvided;
        uint256 totalServicesConsumed;
        uint256 totalSpent;
        uint256 totalEarned;
        uint256 reputationScore;
        bool registered;
    }

    // State
    mapping(bytes32 => Service) public services;
    mapping(address => AgentProfile) public agents;
    mapping(address => bytes32[]) public agentServices;
    bytes32[] public allServiceIds;

    // Payment token (USDT on X Layer)
    address public paymentToken;
    address public owner;

    // Events
    event AgentRegistered(address indexed agent, string name);
    event ServiceRegistered(bytes32 indexed serviceId, address indexed provider, string name, uint256 price);
    event ServiceCalled(bytes32 indexed serviceId, address indexed caller, address indexed provider, uint256 price);
    event ServiceRated(bytes32 indexed serviceId, address indexed rater, uint8 rating);
    event ServiceDeactivated(bytes32 indexed serviceId);
    event ServicePriceUpdated(bytes32 indexed serviceId, uint256 oldPrice, uint256 newPrice);

    modifier onlyRegisteredAgent() {
        require(agents[msg.sender].registered, "Agent not registered");
        _;
    }

    modifier onlyServiceProvider(bytes32 serviceId) {
        require(services[serviceId].provider == msg.sender, "Not service provider");
        _;
    }

    constructor(address _paymentToken) {
        paymentToken = _paymentToken;
        owner = msg.sender;
    }

    /**
     * @notice Register a new agent profile
     */
    function registerAgent(string calldata name) external {
        require(!agents[msg.sender].registered, "Already registered");
        agents[msg.sender] = AgentProfile({
            wallet: msg.sender,
            name: name,
            totalServicesProvided: 0,
            totalServicesConsumed: 0,
            totalSpent: 0,
            totalEarned: 0,
            reputationScore: 100,
            registered: true
        });
        emit AgentRegistered(msg.sender, name);
    }

    /**
     * @notice Register a new service
     */
    function registerService(
        string calldata name,
        string calldata description,
        string calldata endpoint,
        uint256 pricePerCall
    ) external onlyRegisteredAgent returns (bytes32 serviceId) {
        serviceId = keccak256(abi.encodePacked(msg.sender, name, block.timestamp));

        services[serviceId] = Service({
            provider: msg.sender,
            name: name,
            description: description,
            endpoint: endpoint,
            pricePerCall: pricePerCall,
            totalCalls: 0,
            totalRevenue: 0,
            rating: 0,
            ratingCount: 0,
            active: true,
            registeredAt: block.timestamp
        });

        agentServices[msg.sender].push(serviceId);
        allServiceIds.push(serviceId);

        emit ServiceRegistered(serviceId, msg.sender, name, pricePerCall);
    }

    /**
     * @notice Record a service call (called after x402 payment is verified)
     */
    function recordServiceCall(
        bytes32 serviceId,
        address caller
    ) external {
        Service storage svc = services[serviceId];
        require(svc.active, "Service not active");
        require(svc.provider == msg.sender || msg.sender == owner, "Unauthorized");

        svc.totalCalls++;
        svc.totalRevenue += svc.pricePerCall;

        AgentProfile storage provider = agents[svc.provider];
        provider.totalServicesProvided++;
        provider.totalEarned += svc.pricePerCall;

        if (agents[caller].registered) {
            agents[caller].totalServicesConsumed++;
            agents[caller].totalSpent += svc.pricePerCall;
        }

        emit ServiceCalled(serviceId, caller, svc.provider, svc.pricePerCall);
    }

    /**
     * @notice Rate a service after using it
     */
    function rateService(bytes32 serviceId, uint8 score) external onlyRegisteredAgent {
        require(score >= 1 && score <= 5, "Score must be 1-5");
        Service storage svc = services[serviceId];
        require(svc.active, "Service not active");

        svc.rating += score;
        svc.ratingCount++;

        // Update provider reputation
        AgentProfile storage provider = agents[svc.provider];
        provider.reputationScore = (provider.reputationScore * 9 + score * 20) / 10;

        emit ServiceRated(serviceId, msg.sender, score);
    }

    /**
     * @notice Update service price (autonomous repricing by agent)
     */
    function updateServicePrice(bytes32 serviceId, uint256 newPrice)
        external
        onlyServiceProvider(serviceId)
    {
        uint256 oldPrice = services[serviceId].pricePerCall;
        services[serviceId].pricePerCall = newPrice;
        emit ServicePriceUpdated(serviceId, oldPrice, newPrice);
    }

    /**
     * @notice Deactivate a service
     */
    function deactivateService(bytes32 serviceId)
        external
        onlyServiceProvider(serviceId)
    {
        services[serviceId].active = false;
        emit ServiceDeactivated(serviceId);
    }

    // ─── View Functions ────────────────────────────────────

    function getServiceCount() external view returns (uint256) {
        return allServiceIds.length;
    }

    function getServiceById(bytes32 serviceId) external view returns (Service memory) {
        return services[serviceId];
    }

    function getAgentServices(address agent) external view returns (bytes32[] memory) {
        return agentServices[agent];
    }

    function getAgentProfile(address agent) external view returns (AgentProfile memory) {
        return agents[agent];
    }

    function getAllActiveServices() external view returns (bytes32[] memory activeIds, Service[] memory activeServices) {
        uint256 count = 0;
        for (uint256 i = 0; i < allServiceIds.length; i++) {
            if (services[allServiceIds[i]].active) count++;
        }

        activeIds = new bytes32[](count);
        activeServices = new Service[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < allServiceIds.length; i++) {
            if (services[allServiceIds[i]].active) {
                activeIds[idx] = allServiceIds[i];
                activeServices[idx] = services[allServiceIds[i]];
                idx++;
            }
        }
    }

    function getAverageRating(bytes32 serviceId) external view returns (uint256) {
        Service memory svc = services[serviceId];
        if (svc.ratingCount == 0) return 0;
        return (svc.rating * 100) / svc.ratingCount; // Returns rating * 100 for precision
    }
}
